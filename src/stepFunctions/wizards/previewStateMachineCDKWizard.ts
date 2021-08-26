/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as picker from '../../shared/ui/picker'

const localize = nls.loadMessageBundle()

import { AppNode } from '../../cdk/explorer/nodes/appNode'
import { CdkAppLocation } from '../../cdk/explorer/cdkProject'
import { ConstructNode } from '../../cdk/explorer/nodes/constructNode'
import { detectCdkProjects } from '../../cdk/explorer/detectCdkProjects'
import {
    MultiStepWizard,
    WIZARD_GOBACK,
    WIZARD_TERMINATE,
    wizardContinue,
    WizardStep,
} from '../../shared/wizards/multiStepWizard'

export interface CdkAppLocationPickItem {
    label: string
    cdkApplocation: CdkAppLocation | undefined
}

export interface TopLevelNodePickItem {
    label: string
    topLevelNode: ConstructNode | undefined
}

export interface ConstructNodePickItem {
    label: string
    stateMachineNode: ConstructNode | undefined
}

interface PreviewStateMachineCDKWizardResponse {
    cdkApplication: CdkAppLocationPickItem
    topLevelNode: TopLevelNodePickItem
    stateMachine: ConstructNodePickItem
}

export class PreviewStateMachineCDKWizard extends MultiStepWizard<PreviewStateMachineCDKWizardResponse> {
    private cdkApplication?: CdkAppLocationPickItem
    private topLevelNode?: TopLevelNodePickItem
    private stateMachine?: ConstructNodePickItem
    private promptUser: typeof picker.promptUser

    public constructor(promptUser?: typeof picker.promptUser) {
        super()
        this.promptUser = promptUser || picker.promptUser.bind(picker)
    }

    protected get startStep() {
        return this.SELECT_WORKSPACE_ACTION
    }

    private readonly SELECT_WORKSPACE_ACTION: WizardStep = async () => {
        const cdkAppLocationsHelper: CdkAppLocation[] = await detectCdkProjects(vscode.workspace.workspaceFolders)
        const cdkAppLocations: CdkAppLocationPickItem[] = cdkAppLocationsHelper.map(obj => {
            return {
                label: getCDKAppWorkspaceName(obj.cdkJsonPath),
                cdkApplocation: obj,
            }
        })

        if (cdkAppLocations.length === 0) {
            cdkAppLocations.push({
                label: localize('Aws.cdk.app.noWorkspace', '[No workspace found]'),
                cdkApplocation: undefined,
            })
        }

        const quickPick = picker.createQuickPick<CdkAppLocationPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.message.prompt.selectCDKWorkspace.placeholder', 'Select CDK workspace'),
                step: 1,
                totalSteps: 3,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: cdkAppLocations,
        })

        const choices = await this.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })

        this.cdkApplication = picker.verifySinglePickerOutput<CdkAppLocationPickItem>(choices)
        return this.cdkApplication ? wizardContinue(this.SELECT_APPLICATION_ACTION) : WIZARD_GOBACK
    }

    private readonly SELECT_APPLICATION_ACTION: WizardStep = async () => {
        const appLocation = this.cdkApplication?.cdkApplocation

        if (!appLocation) {
            const cdkApplications: TopLevelNodePickItem[] = []
            cdkApplications.push({
                label: localize('AWS.cdk.explorerNode.noApps', '[No CDK App Location]'),
                topLevelNode: undefined,
            })
            return WIZARD_GOBACK
        }

        const appNode = new AppNode(appLocation)
        const constructNodes = await appNode.getChildren()
        const cdkApplications: TopLevelNodePickItem[] = constructNodes.map(node => {
            return {
                label: node.label || '',
                topLevelNode: node as ConstructNode,
            }
        })

        if (cdkApplications.length === 0) {
            cdkApplications.push({
                label: localize(
                    'AWS.cdk.explorerNode.noApps',
                    "[No cdk application(s) found in workspace '{0}']",
                    getCDKAppWorkspaceName(appLocation.cdkJsonPath)
                ),
                topLevelNode: undefined,
            })
        }

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.message.prompt.selectCDKStateMachine.placeholder', 'Select CDK Application'),
                step: 2,
                totalSteps: 3,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: cdkApplications,
        })

        const choices = await this.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })

        this.topLevelNode = picker.verifySinglePickerOutput<TopLevelNodePickItem>(choices)

        return this.topLevelNode ? wizardContinue(this.SELECT_STATE_MACHINE_ACTION) : WIZARD_GOBACK
    }

    private readonly SELECT_STATE_MACHINE_ACTION: WizardStep = async () => {
        const topLevelNode = this.topLevelNode ? this.topLevelNode : undefined
        const stateMachines: ConstructNodePickItem[] = []
        const topLevelNodes = await topLevelNode?.topLevelNode?.getChildren()

        if (topLevelNodes && topLevelNodes.length > 0) {
            topLevelNodes
                .filter(function (node) {
                    return node.contextValue === 'awsCdkStateMachineNode'
                })
                .map(async node => {
                    stateMachines.push({
                        label: node.label ? node.label : '',
                        stateMachineNode: node as ConstructNode,
                    })
                })
        }

        if (stateMachines.length === 0) {
            stateMachines.push({
                label: localize(
                    'Aws.cdk.explorerNode.app.noStateMachines',
                    "[No state machine(s) found in cdk application '{0}']",
                    topLevelNode?.label
                ),
                stateMachineNode: undefined,
            })
        }

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize('AWS.message.prompt.selectCDKStateMachine.placeholder', 'Select State Machine'),
                step: 3,
                totalSteps: 3,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: stateMachines,
        })

        const choices = await this.promptUser({
            picker: quickPick,
            onDidTriggerButton: (button, resolve) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })

        this.stateMachine = picker.verifySinglePickerOutput<ConstructNodePickItem>(choices)
        return this.stateMachine ? WIZARD_TERMINATE : WIZARD_GOBACK
    }

    protected getResult():
        | {
              cdkApplication: CdkAppLocationPickItem
              topLevelNode: TopLevelNodePickItem
              stateMachine: ConstructNodePickItem
          }
        | undefined {
        return (
            (this.cdkApplication &&
                this.topLevelNode &&
                this.stateMachine && {
                    cdkApplication: this.cdkApplication,
                    topLevelNode: this.topLevelNode,
                    stateMachine: this.stateMachine,
                }) ||
            undefined
        )
    }
}

/**
 * @param {string} cdkJsonPath - path to the cdk.json file
 * @returns name of the workspace of the CDK Application
 */
export function getCDKAppWorkspaceName(cdkJsonPath: string): string {
    if (typeof cdkJsonPath !== 'string') {
        return cdkJsonPath
    }
    cdkJsonPath = cdkJsonPath.replace('/cdk.json', '')
    return cdkJsonPath.substring(cdkJsonPath.lastIndexOf('/') + 1, cdkJsonPath.length)
}
