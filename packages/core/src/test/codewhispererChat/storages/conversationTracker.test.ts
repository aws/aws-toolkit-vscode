/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as assert from 'assert'
import { ConversationTracker } from '../../../codewhispererChat/storages/conversationTracker'

describe('ConversationTracker', () => {
    let tracker: ConversationTracker
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        // Reset the singleton instance before each test
        // @ts-ignore: Accessing private static property for testing
        ConversationTracker.instance = undefined
        tracker = ConversationTracker.getInstance()
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('getInstance', () => {
        it('should return the same instance when called multiple times', () => {
            const instance1 = ConversationTracker.getInstance()
            const instance2 = ConversationTracker.getInstance()
            assert.strictEqual(instance1, instance2)
        })
    })

    describe('registerTrigger', () => {
        it('should register a trigger with a token', () => {
            const tokenSource = new vscode.CancellationTokenSource()
            tracker.registerTrigger('trigger1', tokenSource)

            // @ts-ignore: Accessing private property for testing
            assert.strictEqual(tracker.triggerToToken.get('trigger1'), tokenSource)
        })

        it('should associate a trigger with a tab', () => {
            const tokenSource = new vscode.CancellationTokenSource()
            tracker.registerTrigger('trigger1', tokenSource, 'tab1')

            // @ts-ignore: Accessing private property for testing
            const tabTriggers = tracker.tabToTriggers.get('tab1')
            assert.deepStrictEqual(tabTriggers, ['trigger1'])
        })

        it('should add new triggers to the beginning of the tab triggers array', () => {
            const tokenSource1 = new vscode.CancellationTokenSource()
            const tokenSource2 = new vscode.CancellationTokenSource()

            tracker.registerTrigger('trigger1', tokenSource1, 'tab1')
            tracker.registerTrigger('trigger2', tokenSource2, 'tab1')

            // @ts-ignore: Accessing private property for testing
            const tabTriggers = tracker.tabToTriggers.get('tab1')
            assert.deepStrictEqual(tabTriggers, ['trigger2', 'trigger1'])
        })

        it('should not register if triggerID or tokenSource is missing', () => {
            const tokenSource = new vscode.CancellationTokenSource()

            // @ts-ignore: Testing with invalid parameters
            tracker.registerTrigger(null, tokenSource)
            // @ts-ignore: Testing with invalid parameters
            tracker.registerTrigger('trigger1', null)

            // @ts-ignore: Accessing private property for testing
            assert.strictEqual(tracker.triggerToToken.size, 0)
        })

        it('should clean up old triggers when exceeding maxTriggersPerTab', () => {
            // @ts-ignore: Set a smaller maxTriggersPerTab for testing
            tracker.maxTriggersPerTab = 3

            for (let i = 1; i <= 5; i++) {
                tracker.registerTrigger(`trigger${i}`, new vscode.CancellationTokenSource(), 'tab1')
            }

            // @ts-ignore: Accessing private property for testing
            const tabTriggers = tracker.tabToTriggers.get('tab1')
            assert.strictEqual(tabTriggers?.length, 3)
            assert.deepStrictEqual(tabTriggers, ['trigger5', 'trigger4', 'trigger3'])
        })
    })

    describe('markTriggerCompleted', () => {
        it('should dispose and remove the token for a completed trigger', () => {
            const tokenSource = new vscode.CancellationTokenSource()
            const disposeSpy = sandbox.spy(tokenSource, 'dispose')

            tracker.registerTrigger('trigger1', tokenSource)
            tracker.markTriggerCompleted('trigger1')

            assert.strictEqual(disposeSpy.calledOnce, true)
            // @ts-ignore: Accessing private property for testing
            assert.strictEqual(tracker.triggerToToken.has('trigger1'), false)
        })

        it('should do nothing if triggerID is missing', () => {
            const tokenSource = new vscode.CancellationTokenSource()
            const disposeSpy = sandbox.spy(tokenSource, 'dispose')

            tracker.registerTrigger('trigger1', tokenSource)
            // @ts-ignore: Testing with invalid parameter
            tracker.markTriggerCompleted(null)

            assert.strictEqual(disposeSpy.called, false)
            // @ts-ignore: Accessing private property for testing
            assert.strictEqual(tracker.triggerToToken.has('trigger1'), true)
        })
    })

    describe('cancelTrigger', () => {
        it('should cancel a trigger and return true', () => {
            const tokenSource = new vscode.CancellationTokenSource()
            const cancelSpy = sandbox.spy(tokenSource, 'cancel')

            tracker.registerTrigger('trigger1', tokenSource)
            const result = tracker.cancelTrigger('trigger1')

            assert.strictEqual(cancelSpy.calledOnce, true)
            assert.strictEqual(result, true)
        })

        it('should return false if trigger does not exist', () => {
            const result = tracker.cancelTrigger('nonexistent')
            assert.strictEqual(result, false)
        })

        it('should return false if triggerID is missing', () => {
            // @ts-ignore: Testing with invalid parameter
            const result = tracker.cancelTrigger(null)
            assert.strictEqual(result, false)
        })
    })

    describe('cancelTabTriggers', () => {
        it('should cancel all triggers for a tab and return the count', () => {
            const tokenSource1 = new vscode.CancellationTokenSource()
            const tokenSource2 = new vscode.CancellationTokenSource()
            const cancelSpy1 = sandbox.spy(tokenSource1, 'cancel')
            const cancelSpy2 = sandbox.spy(tokenSource2, 'cancel')

            tracker.registerTrigger('trigger1', tokenSource1, 'tab1')
            tracker.registerTrigger('trigger2', tokenSource2, 'tab1')

            const result = tracker.cancelTabTriggers('tab1')

            assert.strictEqual(cancelSpy1.calledOnce, true)
            assert.strictEqual(cancelSpy2.calledOnce, true)
            assert.strictEqual(result, 2)
        })

        it('should return 0 if tab has no triggers', () => {
            const result = tracker.cancelTabTriggers('nonexistent')
            assert.strictEqual(result, 0)
        })

        it('should return 0 if tabID is missing', () => {
            // @ts-ignore: Testing with invalid parameter
            const result = tracker.cancelTabTriggers(null)
            assert.strictEqual(result, 0)
        })
    })

    describe('isTriggerCancelled', () => {
        it('should return true if trigger is cancelled', () => {
            const tokenSource = new vscode.CancellationTokenSource()
            tokenSource.cancel()

            tracker.registerTrigger('trigger1', tokenSource)
            const result = tracker.isTriggerCancelled('trigger1')

            assert.strictEqual(result, true)
        })

        it('should return false if trigger is not cancelled', () => {
            const tokenSource = new vscode.CancellationTokenSource()

            tracker.registerTrigger('trigger1', tokenSource)
            const result = tracker.isTriggerCancelled('trigger1')

            assert.strictEqual(result, false)
        })

        it('should return false if trigger does not exist', () => {
            const result = tracker.isTriggerCancelled('nonexistent')
            assert.strictEqual(result, false)
        })

        it('should return true if triggerID is missing', () => {
            // @ts-ignore: Testing with invalid parameter
            const result = tracker.isTriggerCancelled(null)
            assert.strictEqual(result, true)
        })
    })

    describe('getTokenForTrigger', () => {
        it('should return the token for a trigger', () => {
            const tokenSource = new vscode.CancellationTokenSource()

            tracker.registerTrigger('trigger1', tokenSource)
            const result = tracker.getTokenForTrigger('trigger1')

            assert.strictEqual(result, tokenSource.token)
        })

        it('should return undefined if trigger does not exist', () => {
            const result = tracker.getTokenForTrigger('nonexistent')
            assert.strictEqual(result, undefined)
        })
    })

    describe('clearTabTriggers', () => {
        it('should clear all triggers for a tab without cancelling them', () => {
            const tokenSource1 = new vscode.CancellationTokenSource()
            const tokenSource2 = new vscode.CancellationTokenSource()
            const cancelSpy1 = sandbox.spy(tokenSource1, 'cancel')
            const cancelSpy2 = sandbox.spy(tokenSource2, 'cancel')

            tracker.registerTrigger('trigger1', tokenSource1, 'tab1')
            tracker.registerTrigger('trigger2', tokenSource2, 'tab1')

            const result = tracker.clearTabTriggers('tab1')

            assert.strictEqual(cancelSpy1.called, false)
            assert.strictEqual(cancelSpy2.called, false)
            assert.strictEqual(result, 2)

            // @ts-ignore: Accessing private property for testing
            assert.strictEqual(tracker.triggerToToken.has('trigger1'), false)
            // @ts-ignore: Accessing private property for testing
            assert.strictEqual(tracker.triggerToToken.has('trigger2'), false)
            // @ts-ignore: Accessing private property for testing
            assert.strictEqual(tracker.tabToTriggers.has('tab1'), false)
        })

        it('should return 0 if tab has no triggers', () => {
            const result = tracker.clearTabTriggers('nonexistent')
            assert.strictEqual(result, 0)
        })

        it('should return 0 if tabID is missing', () => {
            // @ts-ignore: Testing with invalid parameter
            const result = tracker.clearTabTriggers(null)
            assert.strictEqual(result, 0)
        })
    })
})
