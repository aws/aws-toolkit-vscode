/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { FeedbackPanel, submitFeedbackListener, Window } from '../../../feedback/commands/submitFeedbackListener'
import { TelemetryFeedback } from '../../../shared/telemetry/telemetryFeedback'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { TelemetryEvent } from '../../../shared/telemetry/telemetryEvent'

class MockFeedbackPanel implements FeedbackPanel {
    public message?: any
    public isDisposed = false

    public postMessage(message: any): Thenable<boolean> {
        this.message = message

        return Promise.resolve(true)
    }

    public dispose(): any {
        this.isDisposed = true
    }
}

class MockWindow implements Window {
    public message?: string

    public showInformationMessage(message: string): Thenable<string | undefined> {
        this.message = message

        return Promise.resolve(undefined)
    }
}

class MockTelemetryService implements TelemetryService {
    public telemetryEnabled = false
    public persistFilePath = ''

    public feedback?: TelemetryFeedback

    public constructor(private readonly onPostFeedback: () => void = () => undefined) {}

    public async start(): Promise<void> {}

    public async shutdown(): Promise<void> {}

    public async postFeedback(feedback: TelemetryFeedback): Promise<void> {
        this.feedback = feedback
        this.onPostFeedback()
    }

    public record(event: TelemetryEvent) {}

    public clearRecords() {}

    public notifyOptOutOptionMade() {}
}

const COMMENT = 'comment'
const SENTIMENT = 'Positive'
const FAILURE = 'failure'

describe('submitFeedbackListener', () => {
    let panel: MockFeedbackPanel
    let window: MockWindow
    let telemetry: MockTelemetryService

    beforeEach(async () => {
        panel = new MockFeedbackPanel()
        window = new MockWindow()
        telemetry = new MockTelemetryService()
    })

    describe('submitFeedback', () => {
        it('submits feedback and posts success message on success', async () => {
            const listener = submitFeedbackListener(panel, window, telemetry)

            await listener({ command: 'submitFeedback', comment: COMMENT, sentiment: SENTIMENT })

            assert.deepStrictEqual(telemetry.feedback, { comment: COMMENT, sentiment: SENTIMENT })
            assert.deepStrictEqual(panel.message, { statusCode: 'Success' })
            assert.strictEqual(panel.isDisposed, false)
            assert.strictEqual(window.message, undefined)
        })

        it('submits feedback and posts failure message on failure', async () => {
            telemetry = new MockTelemetryService(() => {
                throw new Error(FAILURE)
            })

            const listener = submitFeedbackListener(panel, window, telemetry)

            await listener({ command: 'submitFeedback', comment: COMMENT, sentiment: SENTIMENT })

            assert.deepStrictEqual(telemetry.feedback, { comment: COMMENT, sentiment: SENTIMENT })
            assert.deepStrictEqual(panel.message, { statusCode: 'Failure', error: FAILURE })
            assert.strictEqual(panel.isDisposed, false)
            assert.strictEqual(window.message, undefined)
        })
    })

    describe('dispose', () => {
        it('disposes and shows information message on dispose', async () => {
            const listener = submitFeedbackListener(panel, window, telemetry)

            await listener({ command: 'dispose' })

            assert.strictEqual(telemetry.feedback, undefined)
            assert.strictEqual(panel.message, undefined)
            assert.strictEqual(panel.isDisposed, true)
            assert.strictEqual(window.message, 'Thanks for the feedback!')
        })
    })
})
