/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

import AdmZip from 'adm-zip'
import * as fs from 'fs-extra'
import * as path from 'path'
import { showConfirmationMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import {
    fileExists,
    cloud9Findfile,
    makeTemporaryToolkitFolder,
    tryRemoveFolder,
} from '../../shared/filesystemUtilities'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext } from '../../shared/sam/cli/samCliContext'
import { SamTemplateGenerator } from '../../shared/templates/sam/samTemplateGenerator'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { getLambdaDetails, listLambdaFunctions } from '../utils'
import { getIdeProperties, isCloud9 } from '../../shared/extensionUtilities'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { StepEstimator, Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { createSingleFileDialog } from '../../shared/ui/common/openDialog'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { ToolkitError } from '../../shared/errors'
import { FunctionConfiguration } from 'aws-sdk/clients/lambda'
import globals from '../../shared/extensionGlobals'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { fromExtensionManifest } from '../../shared/settings'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Result, Runtime } from '../../shared/telemetry/telemetry'

interface SavedLambdas {
    [profile: string]: { [region: string]: string }
}

class LambdaSettings extends fromExtensionManifest('aws.lambda', { recentlyUploaded: Object }) {
    static #instance: LambdaSettings

    public getRecentLambdas(): SavedLambdas | undefined {
        try {
            return this.get('recentlyUploaded')
        } catch (error) {
            this.delete('recentlyUploaded').catch(e => {
                getLogger().error('TypedSettings.delete() failed: %s', (e as Error).message)
            })
        }
    }

    /**
     * Adds a new "recently used Lambda" to user settings for the given profile
     * and region (limit of one item per profile+region).
     */
    public setRecentLambda(profile: string, region: string, lambdaName: string): Promise<boolean> {
        const oldLambdas = this.getRecentLambdas()
        return this.update('recentlyUploaded', {
            ...oldLambdas,
            [profile]: {
                ...(oldLambdas?.[profile] ?? {}),
                [region]: lambdaName,
            },
        })
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }
}

export interface LambdaFunction {
    readonly name: string
    readonly region: string
    readonly configuration?: FunctionConfiguration
}

/**
 * Executes the "Upload Lambda..." command.
 * Allows for uploads of zip files, and both built and unbuilt directories.
 * Does not discriminate on runtime.
 * @param lambdaArg LambdaFunction
 * @param path Uri to the template.yaml file or the directory the command was invoked from
 */
export async function uploadLambdaCommand(lambdaArg?: LambdaFunction, path?: vscode.Uri) {
    let result: Result = 'Cancelled'
    let lambda: LambdaFunction | undefined

    try {
        const response = await new UploadLambdaWizard(lambdaArg, path).run()
        if (!response) {
            getLogger().debug('lambda: UploadLambdaWizard returned undefined. User cancelled.')
            return
        }
        lambda = response.lambda
        if (response.uploadType === 'zip') {
            await runUploadLambdaZipFile(lambda, response.targetUri)
            result = 'Succeeded'
        } else if (response.uploadType === 'directory' && response.directoryBuildType) {
            result = (await runUploadDirectory(lambda, response.directoryBuildType, response.targetUri)) ?? result
            result = 'Succeeded'
        }
        // TODO(sijaden): potentially allow the wizard to easily support tagged-union states
    } catch (err) {
        result = 'Failed'
        if (err instanceof ToolkitError) {
            void showViewLogsMessage(`Could not upload lambda: ${err.message}`)
            getLogger().error(`Lambda upload failed: %O`, err.cause ?? err)
        } else {
            void showViewLogsMessage(`Could not upload lambda (unexpected exception)`)
            getLogger().error(`Lambda upload failed: %s`, err)
        }
    } finally {
        telemetry.lambda_updateFunctionCode.emit({
            result,
            runtime: lambda?.configuration?.Runtime as Runtime | undefined,
        })
        if (result === 'Succeeded') {
            const profile = globals.awsContext.getCredentialProfileName()
            if (profile && lambda) {
                await LambdaSettings.instance.setRecentLambda(profile, lambda.region, lambda.name)
            }
        }
    }
}

/**
 * Selects the type of file to upload (zip/dir) and proceeds with the rest of the workflow.
 */
function createUploadTypePrompter() {
    const items: DataQuickPickItem<'zip' | 'directory'>[] = [
        {
            label: addCodiconToString('file-zip', localize('AWS.generic.filetype.zipfile', 'ZIP Archive')),
            data: 'zip',
        },
        {
            label: addCodiconToString('folder', localize('AWS.generic.filetype.directory', 'Directory')),
            data: 'directory',
        },
    ]

    return createQuickPick(items, {
        title: localize('AWS.lambda.upload.title', 'Select Upload Type'),
        buttons: createCommonButtons(),
    })
}

function createBuildPrompter() {
    const items: DataQuickPickItem<'zip' | 'sam'>[] = [
        {
            label: addCodiconToString('exclude', localizedText.no),
            detail: localize(
                'AWS.lambda.upload.prebuiltDir.detail',
                '{0} Toolkit will upload a ZIP of the selected directory.',
                getIdeProperties().company
            ),
            data: 'zip',
        },
        {
            label: addCodiconToString('gear', localizedText.yes),
            detail: localize(
                'AWS.lambda.upload.unbuiltDir.detail',
                '{0} Toolkit will attempt to build the selected directory using the sam build command.',
                getIdeProperties().company
            ),
            data: 'sam',
        },
    ]

    return createQuickPick(items, {
        title: localize('AWS.lambda.upload.buildDirectory.title', 'Build directory?'),
        buttons: createCommonButtons(),
    })
}

function createConfirmDeploymentPrompter(lambda: LambdaFunction) {
    // TODO(sijaden): make this a quick pick? Tried to keep as close to possible as the original impl.
    return new (class extends Prompter<boolean> {
        protected promptUser(): Promise<PromptResult<boolean>> {
            return confirmLambdaDeployment(lambda).then(res => res || WIZARD_BACK)
        }

        // Stubs. Need to thin-out the `Prompter` interface to avoid this.
        public setStepEstimator(estimator: StepEstimator<boolean>): void {}
        public setSteps(current: number, total: number): void {}

        public set recentItem(response: any) {}
        public get recentItem(): any {
            return undefined
        }
    })()
}

export interface UploadLambdaWizardState {
    readonly uploadType: 'zip' | 'directory'
    readonly targetUri: vscode.Uri
    readonly directoryBuildType: 'zip' | 'sam'
    readonly confirmedDeploy: boolean
    readonly lambda: LambdaFunction
}

export class UploadLambdaWizard extends Wizard<UploadLambdaWizardState> {
    constructor(lambda?: LambdaFunction, invokePath?: vscode.Uri) {
        super({ initState: { lambda } })
        this.form.lambda.region.bindPrompter(() => createRegionPrompter().transform(region => region.id))

        if (invokePath) {
            this.form.uploadType.setDefault('directory')
            if (fs.statSync(invokePath.fsPath).isFile()) {
                this.form.targetUri.setDefault(vscode.Uri.file(path.dirname(invokePath.fsPath)))
            } else {
                this.form.targetUri.setDefault(invokePath)
            }
        } else {
            this.form.uploadType.bindPrompter(() => createUploadTypePrompter())
            this.form.targetUri.bindPrompter(({ uploadType }) => {
                if (uploadType === 'directory') {
                    return createSingleFileDialog({
                        canSelectFolders: true,
                        canSelectFiles: false,
                    })
                } else {
                    return createSingleFileDialog({
                        canSelectFolders: false,
                        canSelectFiles: true,
                        filters: {
                            'ZIP archive': ['zip'],
                        },
                    })
                }
            })
        }

        this.form.lambda.name.bindPrompter(state => {
            // invoking from the command palette passes no arguments
            if (!invokePath) {
                if (state.uploadType === 'directory') {
                    return createFunctionNamePrompter(state.lambda!.region!, state.targetUri)
                } else {
                    // if a zip file is chosen, pass the parent directory
                    return createFunctionNamePrompter(
                        state.lambda!.region!,
                        vscode.Uri.file(path.dirname(state.targetUri!.fsPath))
                    )
                }
            } else {
                return createFunctionNamePrompter(state.lambda!.region!, invokePath)
            }
        })
        if (lambda) {
            this.form.directoryBuildType.bindPrompter(() => createBuildPrompter(), {
                showWhen: ({ uploadType }) => uploadType === 'directory',
            })
        } else {
            this.form.directoryBuildType.setDefault('zip')
        }

        this.form.confirmedDeploy.bindPrompter(state => createConfirmDeploymentPrompter(state.lambda!))
    }
}

/**
 * Allows the user to decide whether or not they want to build the directory in question and proceeds with the rest of the deployment workflow.
 * @param lambda LambdaFunction from either a node or input manually
 * @param type Whether to zip or sam build the directory
 * @param window Wrapper around vscode.window functionality for testing
 */
async function runUploadDirectory(lambda: LambdaFunction, type: 'zip' | 'sam', parentDir: vscode.Uri) {
    if (type === 'sam' && lambda.configuration) {
        return await runUploadLambdaWithSamBuild({ ...lambda, configuration: lambda.configuration }, parentDir)
    } else {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
            },
            async progress => {
                return await zipAndUploadDirectory(lambda, parentDir.fsPath, progress)
            }
        )
    }
}

/**
 * Attempts to build a project using `sam build`.
 * * Checks supported interpreted languages to see if the handler file exists (based on upstream handler name)
 * * Creates a temporary template based on the parent dir and the upstream handler name
 * * Executes `sam build` on the temporary template
 * * Sends directory to be archived and uploaded
 * @param lambda LambdaFunction from either a node or input manually
 * @param parentDir Parent dir to build
 * @param window Wrapper around vscode.window functionality for testing
 */
async function runUploadLambdaWithSamBuild(lambda: Required<LambdaFunction>, parentDir: vscode.Uri) {
    // Detect if handler is present and provide strong guidance against proceeding if not.
    try {
        const handlerFile = path.join(parentDir.fsPath, getLambdaDetails(lambda.configuration).fileName)
        if (!(await fileExists(handlerFile))) {
            const isConfirmed = await showConfirmationMessage({
                prompt: localize(
                    'AWS.lambda.upload.handlerNotFound',
                    "{0} Toolkit can't find a file corresponding to handler: {1} at filepath {2}.\n\nThis directory likely will not work with this function.\n\nProceed with upload anyway?",
                    getIdeProperties().company,
                    lambda.configuration.Handler,
                    handlerFile
                ),
                confirm: localizedText.yes,
                cancel: localizedText.no,
            })

            if (!isConfirmed) {
                getLogger().info('Handler file not found. Aborting runUploadLambdaWithSamBuild')
                return 'Cancelled'
            }
        }
    } catch (e) {
        // TODO: Give provisional support for Ruby?
        getLogger().info(
            'Attempting to build a runtime that AWS Toolkit does not have handler validation for. Ignoring handler check.'
        )
    }

    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            let tempDir: string | undefined
            try {
                const invoker = getSamCliContext().invoker

                tempDir = await makeTemporaryToolkitFolder()
                const templatePath = path.join(tempDir, 'template.yaml')
                const resourceName = 'tempResource'

                // TODO: Use an existing template file if it's present?
                progress.report({
                    message: localize(
                        'AWS.lambda.upload.progress.generatingTemplate',
                        'Setting up temporary build files...'
                    ),
                })
                await new SamTemplateGenerator()
                    .withFunctionHandler(lambda.configuration.Handler!)
                    .withResourceName(resourceName)
                    .withRuntime(lambda.configuration.Runtime!)
                    .withCodeUri(parentDir.fsPath)
                    .generate(templatePath)

                progress.report({
                    message: localize(
                        'AWS.lambda.upload.progress.samBuilding',
                        'Building project via sam build command...'
                    ),
                })
                const buildDir = path.join(tempDir, 'output')
                // Note: `sam build` will fail if the selected directory does not have a valid manifest file:
                // https://github.com/awslabs/aws-sam-cli/blob/4f12dc74ca8ff6fddd661711db7c3048812b4119/designs/sam_build_cmd.md#built-in-build-actions
                await new SamCliBuildInvocation({
                    buildDir,
                    templatePath,
                    invoker,
                    skipPullImage: true,
                    useContainer: false,
                    baseDir: parentDir.fsPath,
                }).execute()

                // App builds into a folder named after the resource name. Zip the contents of that, not the whole output dir.
                return await zipAndUploadDirectory(lambda, path.join(buildDir, resourceName), progress)
            } catch (err) {
                throw new ToolkitError('Failed to build directory', { cause: err as Error })
            } finally {
                await tryRemoveFolder(tempDir)
            }
        }
    )
}

/**
 * Confirms whether or not the user wants to deploy the Lambda as it is a destructive action.
 * @param lambda LambdaFunction
 * @param window Wrapper around vscode.window functionality for testing
 */
async function confirmLambdaDeployment(lambda: LambdaFunction): Promise<boolean> {
    const isConfirmed = await showConfirmationMessage({
        prompt: localize(
            'AWS.lambda.upload.confirm',
            'This will immediately publish the selected code as the $LATEST version of Lambda: {0}.\n\nContinue?',
            lambda.name
        ),
        confirm: localizedText.yes,
        cancel: localizedText.no,
    })

    if (!isConfirmed) {
        getLogger().info('UploadLambda confirmation cancelled.')
    }

    return isConfirmed
}

async function runUploadLambdaZipFile(lambda: LambdaFunction, zipFileUri: vscode.Uri) {
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            const zipFile = await fs.readFile(zipFileUri.fsPath).catch(err => {
                throw new ToolkitError('Failed to read zip', { cause: err })
            })
            return await uploadZipBuffer(lambda, zipFile, progress)
        }
    )
}

/**
 * Zips a selected directory in memory and attempts to upload archive to Lambda
 * @param lambda LambdaFunction
 * @param path Directory path to zip
 * @param progress Progress notification for displaying a status message
 */
async function zipAndUploadDirectory(
    lambda: LambdaFunction,
    path: string,
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>
) {
    progress.report({ message: localize('AWS.lambda.upload.progress.archivingDir', 'Archiving files...') })
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        const zip = new AdmZip()
        zip.addLocalFolder(path)
        zip.toBuffer(resolve, reject)
    }).catch(err => {
        throw new ToolkitError('Failed to archive directory', { cause: err })
    })

    return await uploadZipBuffer(lambda, zipBuffer, progress)
}

/**
 * Attempts to upload Buffer representation of a `.zip` file to an existing Lambda function
 * @param lambda LambdaFunction
 * @param zip Buffer to upload to Lambda
 * @param progress Progress notification for displaying a status message
 * @param lambdaClient Overwriteable Lambda client for testing purposes
 */
async function uploadZipBuffer(
    lambda: LambdaFunction,
    zip: Buffer,
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>,
    lambdaClient = new DefaultLambdaClient(lambda.region)
) {
    progress.report({
        message: localize('AWS.lambda.upload.progress.uploadingArchive', 'Uploading archive to Lambda...'),
    })
    await lambdaClient.updateFunctionCode(lambda.name, zip).catch(err => {
        throw new ToolkitError('Failed to upload zip archive', { cause: err })
    })

    void vscode.window.showInformationMessage(
        localize('AWS.lambda.upload.done', 'Uploaded Lambda function: {0}', lambda.name)
    )
}

export async function findApplicationJsonFile(
    startPath: vscode.Uri,
    cloud9 = isCloud9()
): Promise<vscode.Uri | undefined> {
    if (!(await fileExists(startPath.fsPath))) {
        getLogger().error(
            'findApplicationJsonFile() invalid path (not accessible or does not exist): "%s"',
            startPath.fsPath
        )
        return undefined
    }
    const isdir = fs.statSync(startPath.fsPath).isDirectory()
    const parentDir = isdir ? startPath.fsPath : path.dirname(startPath.fsPath)
    const found = cloud9
        ? await cloud9Findfile(parentDir, '.application.json')
        : await vscode.workspace.findFiles(
              new vscode.RelativePattern(parentDir, '**/.application.json'),
              // exclude:
              // - null      = NO excludes apply
              // - undefined = default excludes apply (e.g. the `files.exclude` setting but not `search.exclude`).
              // eslint-disable-next-line unicorn/no-null
              null,
              1
          )
    if (!found || found.length === 0) {
        getLogger().debug('uploadLambda: .application.json not found in: "%s"', parentDir)
    }
    return found[0]
}

export function getFunctionNames(file: vscode.Uri, region: string): string[] | undefined {
    try {
        const names: string[] = []
        const appData = JSON.parse(fs.readFileSync(file.fsPath, { encoding: 'utf-8' }).toString())
        if (appData['Functions']) {
            const functions = Object.keys(appData['Functions'])
            if (functions) {
                for (const func of functions) {
                    if (appData['Functions'][func]['PhysicalId'] && appData['Functions'][func]['PhysicalId'][region]) {
                        names.push(appData['Functions'][func]['PhysicalId'][region])
                    }
                }
            }
        } else {
            getLogger().info('lambda: Incorrect JSON structure for .application.json file. Missing: "Functions"')
        }
        return names.length > 0 ? names : undefined
    } catch (error) {
        getLogger().error('lambda: failed to parse .application.json: %s', (error as Error).message)
    }
}

async function listAllLambdaNames(region: string, path?: vscode.Uri) {
    const lambdaFunctionNames: DataQuickPickItem<string>[] = []

    // Get Lambda functions from .application.json #2588
    if (path) {
        const appFile = await findApplicationJsonFile(path)
        const namesFromAppFile = appFile ? getFunctionNames(appFile, region) : undefined
        if (!appFile) {
            getLogger().debug('lambda: .application.json not found')
        } else if (!namesFromAppFile) {
            getLogger().debug('lambda: no functions in .application.json for region: %s', region)
        } else {
            lambdaFunctionNames.push(
                ...namesFromAppFile.map(n => {
                    return {
                        label: n,
                        description: localize('AWS.lambda.upload.fromAppJson', 'from .application.json'),
                        data: n,
                    }
                })
            )
        }
    }

    // Get Lambda functions from user AWS account.
    const lambdaClient = new DefaultLambdaClient(region)
    try {
        const foundLambdas = await toArrayAsync(listLambdaFunctions(lambdaClient))
        for (const l of foundLambdas) {
            lambdaFunctionNames.push({ label: l.FunctionName!, data: l.FunctionName })
        }
    } catch (error) {
        getLogger().error('lambda: failed to list Lambda functions: %s', (error as Error).message)
    }

    // Get "recently used" Lambda functions.
    const recent = LambdaSettings.instance.getRecentLambdas()
    const profile = globals.awsContext.getCredentialProfileName()
    if (profile && recent?.[profile]?.[region]) {
        let isInList = false
        for (const l of lambdaFunctionNames) {
            if (l.label === recent[profile][region]) {
                l.recentlyUsed = true
                isInList = true
            }
        }
        if (!isInList) {
            lambdaFunctionNames.splice(0, 0, {
                label: recent[profile][region],
                recentlyUsed: true,
                data: recent[profile][region],
            })
        }
    }

    return lambdaFunctionNames
}

function createFunctionNamePrompter(region: string, path?: vscode.Uri) {
    const items = listAllLambdaNames(region, path)

    const prompter = createQuickPick(items, {
        title: localize('AWS.lambda.upload.selectFunctionName', 'Select a Function'),
        buttons: createCommonButtons(),
        placeholder: localize(
            'aws.lambda.upload.manualEntry.placeholder',
            'Filter or enter existing function name or ARN'
        ),
        filterBoxInputSettings: { label: 'Existing lambda function: ', transform: input => input },
    })

    return prompter
}
