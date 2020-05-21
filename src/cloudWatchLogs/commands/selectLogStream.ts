/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { createQuickPick } from '../../shared/ui/picker'
import { MultiStepWizard, WizardStep } from '../../shared/wizards/multiStepWizard'
import { LogGroupNode } from '../explorer/logGroupNode'

export interface SelectLogStreamResponse {
    region: string
    logGroup: string
    logStream: string
}

export async function selectLogStream(node: LogGroupNode): Promise<void> {
    const logStreamResponse = new SelectLogStreamWizard(node).run()
}

export interface SelectLogStreamWizardContext {
    pickLogStream(): Promise<string | undefined>
}

export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    public async pickLogStream(): Promise<string | undefined> {
        const items: vscode.QuickPickItem[] = []
        const quickPick = createQuickPick<vscode.QuickPickItem>({
            options: {
                title: localize('aws.cloudWatchLogs.selectLogStream.workflow.prompt', 'Select a log stream'),
            },
            items,
        })

        return
    }
}

export class SelectLogStreamWizard extends MultiStepWizard<SelectLogStreamResponse> {
    private readonly response: Partial<SelectLogStreamResponse>

    public constructor(
        node: LogGroupNode,
        private readonly context: SelectLogStreamWizardContext = new DefaultSelectLogStreamWizardContext()
    ) {
        super()
        this.response = {
            region: node.regionCode,
            logGroup: node.logGroup.arn,
        }
    }

    protected get startStep(): WizardStep {
        return this.SELECT_STREAM
    }

    protected getResult(): SelectLogStreamResponse | undefined {
        if (!this.response.region || !this.response.logGroup || !this.response.logStream) {
            return undefined
        }

        vscode.window.showInformationMessage(
            `Not implemented but here's the deets:
region: ${this.response.region}
logGroup: ${this.response.logGroup}
logStream: ${this.response.logStream}`
        )

        return {
            region: this.response.region,
            logGroup: this.response.logGroup,
            logStream: this.response.logStream,
        }
    }

    private readonly SELECT_STREAM: WizardStep = async () => {
        this.response.logStream = await this.context.pickLogStream()

        return undefined
    }
}
