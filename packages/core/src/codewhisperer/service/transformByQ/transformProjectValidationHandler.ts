/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { BuildSystem, TransformationCandidateProject } from '../../models/model'
import * as vscode from 'vscode'
import {
    NoJavaProjectsFoundError,
    NoMavenJavaProjectsFoundError,
    NoOpenProjectsError,
} from '../../../amazonqGumby/errors'
import { checkBuildSystem } from './transformFileHandler'

export async function getOpenProjects(): Promise<TransformationCandidateProject[]> {
    const folders = vscode.workspace.workspaceFolders

    if (folders === undefined || folders.length === 0) {
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

export async function getJavaProjects(projects: TransformationCandidateProject[]) {
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
    if (javaProjects.length === 0) {
        throw new NoJavaProjectsFoundError()
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

    if (mavenJavaProjects.length === 0) {
        throw new NoMavenJavaProjectsFoundError()
    }

    return mavenJavaProjects
}

// This function filters all open projects by first searching for a .java file and then searching for a pom.xml file in all projects.
export async function validateOpenProjects(projects: TransformationCandidateProject[]) {
    const javaProjects = await getJavaProjects(projects)
    const mavenJavaProjects = await getMavenJavaProjects(javaProjects)
    return mavenJavaProjects
}
