/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { BuildSystem, JDKVersion, TransformationCandidateProject } from '../../models/model'
import { getLogger } from '../../../shared/logger'
import * as CodeWhispererConstants from '../../models/constants'
import * as vscode from 'vscode'
import { spawnSync } from 'child_process' // Consider using ChildProcess once we finalize all spawnSync calls
import { CodeTransformJavaSourceVersionsAllowed, telemetry } from '../../../shared/telemetry/telemetry'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import {
    javapOutputToTelemetryValue,
    JDKToTelemetryValue,
} from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import {
    NoJavaProjectsFoundError,
    NoMavenJavaProjectsFoundError,
    NoOpenProjectsError,
} from '../../../amazonqGumby/errors'
import { checkBuildSystem } from './transformFileHandler'

// log project details silently
export async function validateAndLogProjectDetails() {
    let telemetryJavaVersion = JDKToTelemetryValue(JDKVersion.UNSUPPORTED) as CodeTransformJavaSourceVersionsAllowed
    let errorCode = undefined
    try {
        const openProjects = await getOpenProjects()
        const validProjects = await validateOpenProjects(openProjects, true)
        if (validProjects.length > 0) {
            // validProjects[0].JDKVersion will be undefined if javap errors out or no .class files found, so call it UNSUPPORTED
            const javaVersion = validProjects[0].JDKVersion ?? JDKVersion.UNSUPPORTED
            telemetryJavaVersion = JDKToTelemetryValue(javaVersion) as CodeTransformJavaSourceVersionsAllowed
        }
    } catch (err: any) {
        errorCode = err.code
    } finally {
        telemetry.codeTransform_projectDetails.emit({
            passive: true,
            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformLocalJavaVersion: telemetryJavaVersion,
            result: errorCode ? MetadataResult.Fail : MetadataResult.Pass,
            reason: errorCode,
        })
    }
}

export async function getOpenProjects(): Promise<TransformationCandidateProject[]> {
    const folders = vscode.workspace.workspaceFolders

    if (folders === undefined) {
        throw new NoOpenProjectsError()
    }

    const openProjects: TransformationCandidateProject[] = []
    for (const folder of folders) {
        openProjects.push({
            name: folder.name,
            path: folder.uri.fsPath,
        })
    }

    return openProjects
}

async function getJavaProjects(projects: TransformationCandidateProject[]) {
    const javaProjects = []
    for (const project of projects) {
        const projectPath = project.path
        const javaFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectPath!, '**/*.java'),
            '**/node_modules/**',
            1
        )
        if (javaFiles.length > 0) {
            javaProjects.push(project)
        }
    }
    return javaProjects
}

async function getMavenJavaProjects(javaProjects: TransformationCandidateProject[]) {
    const mavenJavaProjects = []

    for (const project of javaProjects) {
        const projectPath = project.path
        const buildSystem = await checkBuildSystem(projectPath!)
        if (buildSystem === BuildSystem.Maven) {
            mavenJavaProjects.push(project)
        }
    }

    return mavenJavaProjects
}

async function getProjectsValidToTransform(
    mavenJavaProjects: TransformationCandidateProject[],
    onProjectFirstOpen: boolean = true
) {
    const projectsValidToTransform: TransformationCandidateProject[] = []
    for (const project of mavenJavaProjects) {
        let detectedJavaVersion = undefined
        const projectPath = project.path
        const compiledJavaFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectPath!, '**/*.class'),
            '**/node_modules/**',
            1
        )
        if (compiledJavaFiles.length > 0) {
            const classFilePath = `${compiledJavaFiles[0].fsPath}`
            const baseCommand = 'javap'
            const args = ['-v', classFilePath]
            const spawnResult = spawnSync(baseCommand, args, { shell: false, encoding: 'utf-8' })
            if (spawnResult.status !== 0) {
                let errorLog = ''
                errorLog += spawnResult.error ? JSON.stringify(spawnResult.error) : ''
                errorLog += `${spawnResult.stderr}\n${spawnResult.stdout}`
                getLogger().error(`CodeTransformation: Error in running javap command = ${errorLog}`)
                let errorReason = ''
                if (spawnResult.stdout) {
                    errorReason = 'JavapExecutionError'
                } else {
                    errorReason = 'JavapSpawnError'
                }
                if (spawnResult.error) {
                    const errorCode = (spawnResult.error as any).code ?? 'UNKNOWN'
                    errorReason += `-${errorCode}`
                }
                if (!onProjectFirstOpen) {
                    telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
                        codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformPreValidationError: 'NoJavaProject',
                        codeTransformRuntimeError: errorReason,
                        result: MetadataResult.Fail,
                        reason: 'CannotDetermineJavaVersion',
                    })
                }
            } else {
                const majorVersionIndex = spawnResult.stdout.indexOf('major version: ')
                const javaVersion = spawnResult.stdout.slice(majorVersionIndex + 15, majorVersionIndex + 17).trim()
                if (javaVersion === CodeWhispererConstants.JDK8VersionNumber) {
                    detectedJavaVersion = JDKVersion.JDK8
                } else if (javaVersion === CodeWhispererConstants.JDK11VersionNumber) {
                    detectedJavaVersion = JDKVersion.JDK11
                } else {
                    detectedJavaVersion = JDKVersion.UNSUPPORTED
                    if (!onProjectFirstOpen) {
                        telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
                            codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                            codeTransformPreValidationError: 'UnsupportedJavaVersion',
                            result: MetadataResult.Fail,
                            reason: javapOutputToTelemetryValue(javaVersion),
                        })
                    }
                }
            }
        }

        // detectedJavaVersion will be undefined if there are no .class files or if javap errors out, otherwise it will be JDK8, JDK11, or UNSUPPORTED
        project.JDKVersion = detectedJavaVersion
        projectsValidToTransform.push(project)
    }
    return projectsValidToTransform
}

/*
 * This function filters all open projects by first searching for a .java file and then searching for a pom.xml file in all projects.
 * It also tries to detect the Java version of each project by running "javap" on a .class file of each project.
 * As long as the project contains a .java file and a pom.xml file, the project is still considered valid for transformation,
 * and we allow the user to specify the Java version.
 */
export async function validateOpenProjects(
    projects: TransformationCandidateProject[],
    onProjectFirstOpen: boolean = true
) {
    const javaProjects = await getJavaProjects(projects)

    if (javaProjects.length === 0) {
        if (!onProjectFirstOpen) {
            telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformPreValidationError: 'NoJavaProject',
                result: MetadataResult.Fail,
                reason: 'CouldNotFindJavaProject',
            })
        }
        throw new NoJavaProjectsFoundError()
    }

    const mavenJavaProjects = await getMavenJavaProjects(javaProjects)
    if (mavenJavaProjects.length === 0) {
        if (!onProjectFirstOpen) {
            void vscode.window.showErrorMessage(CodeWhispererConstants.noPomXmlFoundNotification)
            telemetry.codeTransform_isDoubleClickedToTriggerInvalidProject.emit({
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformPreValidationError: 'NonMavenProject',
                result: MetadataResult.Fail,
                reason: 'NoPomFileFound',
            })
        }
        throw new NoMavenJavaProjectsFoundError()
    }

    /*
     * These projects we know must contain a pom.xml and a .java file
     * here we try to get the Java version of each project so that we
     * can pre-select a default version in the QuickPick for them.
     */
    const projectsValidToTransform = await getProjectsValidToTransform(mavenJavaProjects, onProjectFirstOpen)

    return projectsValidToTransform
}
