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
export interface ConstructNodePickItem {
    label: string,
    //stateMachineNode: ConstructNode | PlaceholderNode
    stateMachineNode: ConstructNode
    //stateMachineNode: string
}

interface PreviewStateMachineCDKWizardResponse {
    cdkApplication: CdkAppLocationPickItem
    stateMachine: ConstructNodePickItem
}

export default class PreviewStateMachineCDKWizard extends MultiStepWizard<PreviewStateMachineCDKWizardResponse> {
    private cdkApplication?: CdkAppLocationPickItem
    private stateMachine?: ConstructNodePickItem
    private promptUser: typeof picker.promptUser

    public constructor(promptUser?: typeof picker.promptUser) {
        super()

        this.promptUser = promptUser || picker.promptUser.bind(picker)
    }

    protected get startStep() {
        return this.CREATE_TEMPLATE_ACTION
    }

    private readonly CREATE_TEMPLATE_ACTION: WizardStep = async () => {
        const cdkAppLocations: CdkAppLocation[] = await detectCdkProjects(vscode.workspace.workspaceFolders)

        if (cdkAppLocations.length === 0) return wizardContinue(this.TEMPLATE_FORMAT_ACTION)
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
                    'AWS.message.prompt.selectCDKApplication.placeholder',
                    'Select CDK Application'
                ),
                step: 1,
                totalSteps: 2,
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
        return this.cdkApplication ? wizardContinue(this.TEMPLATE_FORMAT_ACTION) : WIZARD_GOBACK
    }

    private readonly TEMPLATE_FORMAT_ACTION: WizardStep = async () => {

        const appLocation = this.cdkApplication ? this.cdkApplication.cdkApplocation : undefined
        const appNode = new AppNode(appLocation!)
        const constructNodes = await appNode.getChildren()
        //filter placeholder nodes
        //constructNodes = constructNodes.filter(i => i.contextValue === 'awsCdkConstructNode' || i.contextValue === 'awsCdkStateMachineNode' )

        const STATE_MACHINES: ConstructNodePickItem[] = []
        const topLevelNodes: ConstructNode[] = []
        constructNodes.map(node => {
            //if(node.contextValue === 'awsCdkConstructNode' || node.contextValue === 'awsCdkStateMachineNode'){
            topLevelNodes.push(node as ConstructNode)
            //}
        })

        //what about nested construct nodes??
        while(topLevelNodes.length>0){
            //topLevelNodes.forEach()
            const tester = await topLevelNodes.pop()?.getChildren()
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
        }

        const quickPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectCDKStateMachine.placeholder',
                    'Select State Machine'
                ),
                step: 2,
                totalSteps: 2,
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
                this.stateMachine && {
                cdkApplication: this.cdkApplication,
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