/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as path from 'path'
import { CdkAppLocation, getApp } from '../../cdk/explorer/cdkProject'
import { ConstructNode, isStateMachine } from '../../cdk/explorer/nodes/constructNode'
import { detectCdkProjects } from '../../cdk/explorer/detectCdkProjects'
import { Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { ConstructTreeEntity } from '../../cdk/explorer/tree/types'
import { getDisplayLabel } from '../../cdk/explorer/tree/treeInspector'

function createLocationPrompter() {
    const items = detectCdkProjects(vscode.workspace.workspaceFolders).then(locations => {
        return locations.map(l => ({
            label: vscode.workspace.asRelativePath(l.cdkJsonUri),
            data: l,
        }))
    })

    return createQuickPick(items, {
        title: localize('AWS.message.prompt.selectCDKWorkspace.placeholder', 'Select a CDK application'),
        buttons: createCommonButtons(),
        noItemsFoundItem: {
            label: localize('Aws.cdk.app.noWorkspace', '[No applications found]'),
            data: WIZARD_BACK,
        },
    })
}

export function getStateMachines(construct: ConstructTreeEntity) {
    const stateMachines: ConstructTreeEntity[] = []
    if (isStateMachine(construct)) {
        stateMachines.push(construct)
    }

    const children = Object.values(construct.children ?? {})
    for (const child of children) {
        stateMachines.push(...getStateMachines(child))
    }

    return stateMachines
}

function createResourcePrompter(location: CdkAppLocation) {
    const items = getApp(location)
        .then(app => getStateMachines(app.constructTree.tree))
        .then(constructs =>
            constructs.map(c => ({
                label: getDisplayLabel(c),
                description: path.dirname(c.path),
                data: { construct: c, location: location.treeUri.with({ fragment: c.path }) },
            }))
        )

    return createQuickPick(items, {
        buttons: createCommonButtons(),
        title: localize('AWS.message.prompt.selectCDKStateMachine.placeholder', 'Select State Machine'),
        noItemsFoundItem: {
            label: localize(
                'Aws.cdk.explorerNode.app.noStateMachines',
                "[No state machine(s) found in cdk application '{0}']",
                vscode.workspace.asRelativePath(location.cdkJsonUri)
            ),
            data: WIZARD_BACK,
        },
    })
}

interface State {
    readonly location: CdkAppLocation
    readonly resource: ConstructNode['resource']
}

export class PreviewStateMachineCDKWizard extends Wizard<State> {
    public constructor() {
        super()

        this.form.location.bindPrompter(createLocationPrompter)
        this.form.resource.bindPrompter(({ location }) => createResourcePrompter(location!))
    }
}
