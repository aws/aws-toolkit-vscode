/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as picker from '../../shared/ui/picker'

const localize = nls.loadMessageBundle()

import {
    MultiStepWizard,
    WIZARD_GOBACK,
    WIZARD_TERMINATE,
    wizardContinue,
    WizardStep,
} from '../../shared/wizards/multiStepWizard'
import { CdkAppLocation } from '../explorer/cdkProject'
import { detectCdkProjects } from '../explorer/detectCdkProjects'
import { AppNode } from '../explorer/nodes/appNode'
import { ConstructNode } from '../explorer/nodes/constructNode'

export interface CdkAppLocationPickItem {
    label: string,
    cdkApplocation: CdkAppLocation | undefined
}

export interface TopLevelNodePickItem {
    label: string,
    topLevelNode: ConstructNode | undefined
}

export interface ConstructNodePickItem {
    label: string,
    stateMachineNode: ConstructNode | undefined
}

interface PreviewStateMachineCDKWizardResponse {
    cdkApplication: CdkAppLocationPickItem,
    topLevelNode: TopLevelNodePickItem,
    stateMachine: ConstructNodePickItem
}

export default class PreviewStateMachineCDKWizard extends MultiStepWizard<PreviewStateMachineCDKWizardResponse> {
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
        const cdkAppLocations: CdkAppLocation[] = await detectCdkProjects(vscode.workspace.workspaceFolders)
        const CDK_APPLOCATIONS: CdkAppLocationPickItem[] = []

        cdkAppLocations.map(obj => {
            CDK_APPLOCATIONS.push(
                {
                    label: getCDKAppWorkspaceName(obj.cdkJsonPath),
                    cdkApplocation: obj
                })
        })

        if (CDK_APPLOCATIONS.length === 0) {
            CDK_APPLOCATIONS.push(
                {
                    label: '[No workspace found]',
                    cdkApplocation: undefined
                }
            )
        }

        const quickPick = picker.createQuickPick<CdkAppLocationPickItem>({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectCDKWorkspace.placeholder',
                    'Select CDK workspace'
                ),
                step: 1,
                totalSteps: 3,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: CDK_APPLOCATIONS,
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
        const appLocation = this.cdkApplication ? this.cdkApplication.cdkApplocation : undefined

        if (!appLocation) return WIZARD_GOBACK

        const appNode = new AppNode(appLocation!)
        const constructNodes = await appNode.getChildren()
        const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []

        constructNodes.map(node => {
            TOP_LEVEL_NODES.push({
                label: node.label ? node.label : '',
                topLevelNode: node as ConstructNode
            })
        })

        if (TOP_LEVEL_NODES.length === 0) {
            TOP_LEVEL_NODES.push({
                label: `[No cdk application(s) found in workspace '${getCDKAppWorkspaceName(appLocation.cdkJsonPath)}']`,
                topLevelNode: undefined
            })
        }

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectCDKStateMachine.placeholder',
                    'Select CDK Application'
                ),
                step: 2,
                totalSteps: 3,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: TOP_LEVEL_NODES,
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
        const STATE_MACHINES: ConstructNodePickItem[] = []

        const topLevelNodes = await topLevelNode?.topLevelNode?.getChildren()

        if (topLevelNodes && topLevelNodes.length > 0) {
            topLevelNodes.map(async node => {
                if (node.contextValue === 'awsCdkStateMachineNode') {
                    STATE_MACHINES.push({
                        label: node.label ? node.label : '',
                        stateMachineNode: node as ConstructNode
                    })
                }
            })
        }

        if (STATE_MACHINES.length === 0) {
            STATE_MACHINES.push({
                label: `[No state machine(s) found in cdk applciation '${topLevelNode?.label}']`,
                stateMachineNode: undefined
            })
        }

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectCDKStateMachine.placeholder',
                    'Select State Machine'
                ),
                step: 3,
                totalSteps: 3,
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: STATE_MACHINES,
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

    protected getResult() {
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
 * @returns name of the CDK Application
 */
export function getCDKAppWorkspaceName(cdkJsonPath: string) {
    if (typeof (cdkJsonPath) != "string") return cdkJsonPath;
    cdkJsonPath = cdkJsonPath.replace('/cdk.json', '')
    return cdkJsonPath.substring(cdkJsonPath.lastIndexOf("/") + 1, cdkJsonPath.length)
};