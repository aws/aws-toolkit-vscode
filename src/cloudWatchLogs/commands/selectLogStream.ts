/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as picker from '../../shared/ui/picker'
import { MultiStepWizard, WizardStep } from '../../shared/wizards/multiStepWizard'
import { LogGroupNode } from '../explorer/logGroupNode'
import { IteratingAWSCall, DescribeLogStreamsCall } from '../../shared/clients/defaultCloudWatchLogsClient'
import { CloudWatchLogs } from 'aws-sdk'
import { ext } from '../../shared/extensionGlobals'

export interface SelectLogStreamResponse {
    region: string
    logGroup: string
    logStream: string
}

export async function selectLogStream(node: LogGroupNode): Promise<void> {
    const logStreamResponse = await new SelectLogStreamWizard(node).run()
    if (logStreamResponse) {
        vscode.window.showInformationMessage(
            `Not implemented but here's the deets:
region: ${logStreamResponse.region}
logGroup: ${logStreamResponse.logGroup}
logStream: ${logStreamResponse.logStream}`
        )
    }
}

export interface SelectLogStreamWizardContext {
    pickLogStream(): Promise<string | undefined>
}

export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    public constructor(private readonly regionCode: string, private readonly logGroupName: string) {}

    public async pickLogStream(): Promise<string | undefined> {
        const client: CloudWatchLogs = await ext.sdkClientBuilder.createAndConfigureServiceClient(
            options => new CloudWatchLogs(options),
            undefined,
            this.regionCode
        )
        const qp = new DescribeLogStreamsCallPicker(client, this.logGroupName)

        const choices = await qp.promptUser()
        const val = picker.verifySinglePickerOutput(choices)

        return val?.label
    }
}

abstract class IteratingAWSCallPicker<T> {
    private isDone: boolean = false
    private isPaused: boolean = false
    private items: vscode.QuickPickItem[] = []

    private readonly quickPick: vscode.QuickPick<vscode.QuickPickItem>
    private readonly moreItemsRequest: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()

    public constructor(
        // TODO: allow for creation of a new call in case we want to reload quick pick in its entirety
        private readonly call: IteratingAWSCall<T>,
        pickerOptions: {
            options?: vscode.QuickPickOptions & picker.AdditionalQuickPickOptions
            buttons?: vscode.QuickInputButton[]
        } = {}
    ) {
        this.quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                ...pickerOptions.options,
                onDidSelectItem: item => {
                    // pause any existing execution
                    this.isPaused = true
                    // pass existing onDidSelectItem through if it exists
                    if (pickerOptions.options?.onDidSelectItem) {
                        pickerOptions.options.onDidSelectItem(item)
                    }
                },
            },
            items: this.items,
            buttons: pickerOptions.buttons,
        })

        this.moreItemsRequest.event(() => this.loadItems())
    }

    public async promptUser(): Promise<vscode.QuickPickItem[] | undefined> {
        // start background loading
        this.quickPick.busy = true
        this.isPaused = false
        if (!this.isDone) {
            this.moreItemsRequest.fire()
        }
        return await picker.promptUser<vscode.QuickPickItem>({
            picker: this.quickPick,
            onDidTriggerButton: this.onDidTriggerButton,
        })
    }

    private async loadItems(): Promise<void> {
        if (!this.isDone && !this.isPaused) {
            const response = await this.call.getNext()
            if (!response) {
                this.isDone = true
                this.quickPick.busy = false

                return undefined
            }

            this.items = this.items.concat(this.transformResponse(response))
            this.quickPick.items = this.items
            this.moreItemsRequest.fire()
        }

        return undefined
    }

    // abstract functions

    /**
     * Transforms results from IteratingAWSCall.getNext() into vscode.QuickPickItems to display
     * @param response Response from IteratingAWSCall.getNext()
     */
    protected abstract transformResponse(response: T): vscode.QuickPickItem[]

    /**
     * Handlers if a button is clicked in the quick pick
     * @param button Button pressed
     * @param resolve Resolve action
     * @param reject Reject action
     */
    protected abstract onDidTriggerButton(
        button: vscode.QuickInputButton,
        resolve: (value: vscode.QuickPickItem[] | PromiseLike<vscode.QuickPickItem[] | undefined> | undefined) => void,
        reject: (reason?: any) => void
    ): void
}

class DescribeLogStreamsCallPicker extends IteratingAWSCallPicker<CloudWatchLogs.DescribeLogStreamsResponse> {
    public constructor(client: CloudWatchLogs, groupName: string) {
        super(new DescribeLogStreamsCall(client, groupName), {
            options: {
                title: localize('aws.cloudWatchLogs.selectLogStream.workflow.prompt', 'Select a log stream'),
                matchOnDetail: true,
            },
        })
    }

    protected transformResponse(response: CloudWatchLogs.DescribeLogStreamsResponse): vscode.QuickPickItem[] {
        const result: vscode.QuickPickItem[] = []

        if (response.logStreams) {
            for (const stream of response.logStreams) {
                result.push({
                    label: stream.logStreamName!,
                    detail: stream.lastEventTimestamp ? new Date(stream.lastEventTimestamp).toString() : undefined,
                })
            }
        }

        return result
    }

    protected onDidTriggerButton(
        button: vscode.QuickInputButton,
        resolve: (value: vscode.QuickPickItem[] | PromiseLike<vscode.QuickPickItem[] | undefined> | undefined) => void,
        reject: (reason?: any) => void
    ): void {}
}

export class SelectLogStreamWizard extends MultiStepWizard<SelectLogStreamResponse> {
    private readonly response: Partial<SelectLogStreamResponse>

    public constructor(
        node: LogGroupNode,
        private readonly context: SelectLogStreamWizardContext = new DefaultSelectLogStreamWizardContext(
            node.regionCode,
            node.logGroup.logGroupName!
        )
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
