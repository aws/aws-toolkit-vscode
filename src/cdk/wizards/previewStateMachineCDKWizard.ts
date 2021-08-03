/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { ConstructNode } from '../explorer/nodes/constructNode'
import { AppNode } from '../explorer/nodes/appNode'

export interface CdkAppLocationPickItem {
    label: string,
    cdkApplocation: CdkAppLocation
}

export interface TopLevelNodePickItem {
    label: string,
    topLevelNode: ConstructNode
}

export interface ConstructNodePickItem {
    label: string,
    //stateMachineNode: ConstructNode | PlaceholderNode
    stateMachineNode: ConstructNode
    //stateMachineNode: string
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

        //if (cdkAppLocations.length === 0) return wizardContinue(this.SELECT_WORKSPACE_ACTION)
        if (cdkAppLocations.length === 0) return WIZARD_TERMINATE
        //if (cdkAppLocations.length === 0) return WIZARD_GOBACK
        //need to pick out only the applications containing a state machine 
        const CDK_APPLOCATIONS: CdkAppLocationPickItem[] = []
        cdkAppLocations.map(obj => {
            CDK_APPLOCATIONS.push(
                {
                    label: getCDKAppName(obj.cdkJsonPath),
                    cdkApplocation: obj
                })
        })
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
        if (constructNodes.length === 0) return WIZARD_TERMINATE
        //filter placeholder nodes
        //constructNodes = constructNodes.filter(i => i.contextValue === 'awsCdkConstructNode' || i.contextValue === 'awsCdkStateMachineNode' )

        const TOP_LEVEL_NODES: TopLevelNodePickItem[] = []
        //const topLevelNodes: ConstructNode[] = []
        constructNodes.map(node => {
            //topLevelNodes.push(node as ConstructNode)
            TOP_LEVEL_NODES.push({
                label: node.label ? node.label : '',
                topLevelNode: node as ConstructNode
            })
        })

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectCDKStateMachine.placeholder',
                    'Select State Machine'
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

        const tester = await topLevelNode?.topLevelNode.getChildren()
            if (tester) {
                tester.map(async node => {
                    //const tester = await node.getChildren()
                    if (node.contextValue === 'awsCdkStateMachineNode') {
                        STATE_MACHINES.push({
                            label: node.label ? node.label : '',
                            stateMachineNode: node as ConstructNode
                        })
                    }
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
export function getCDKAppName(cdkJsonPath: string) {
    if (typeof (cdkJsonPath) != "string") return cdkJsonPath;
    cdkJsonPath = cdkJsonPath.replace('/cdk.json', '')
    return cdkJsonPath.substring(cdkJsonPath.lastIndexOf("/") + 1, cdkJsonPath.length)
};