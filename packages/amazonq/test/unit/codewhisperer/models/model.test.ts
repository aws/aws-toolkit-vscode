/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import {
    CodeIssueGroupingStrategy,
    CodeIssueGroupingStrategyState,
    SecurityIssueFilters,
    SecurityTreeViewFilterState,
} from 'aws-core-vscode/codewhisperer'
import { globals } from 'aws-core-vscode/shared'

describe('model', function () {
    describe('SecurityTreeViewFilterState', function () {
        let securityTreeViewFilterState: SecurityTreeViewFilterState

        beforeEach(function () {
            securityTreeViewFilterState = SecurityTreeViewFilterState.instance
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should get the state', async function () {
            const state: SecurityIssueFilters = {
                severity: {
                    Critical: false,
                    High: true,
                    Medium: true,
                    Low: true,
                    Info: true,
                },
            }
            await globals.globalState.update('aws.amazonq.securityIssueFilters', state)
            assert.deepStrictEqual(securityTreeViewFilterState.getState(), state)
        })

        it('should set the state', async function () {
            await globals.globalState.update('aws.amazonq.securityIssueFilters', {
                severity: {
                    Critical: true,
                    High: true,
                    Medium: true,
                    Low: true,
                    Info: true,
                },
            } satisfies SecurityIssueFilters)
            const state = {
                severity: {
                    Critical: false,
                    High: true,
                    Medium: true,
                    Low: true,
                    Info: true,
                },
            } satisfies SecurityIssueFilters
            await securityTreeViewFilterState.setState(state)
            assert.deepStrictEqual(globals.globalState.get('aws.amazonq.securityIssueFilters'), state)
        })

        it('should get hidden severities', async function () {
            await globals.globalState.update('aws.amazonq.securityIssueFilters', {
                severity: {
                    Critical: true,
                    High: false,
                    Medium: true,
                    Low: false,
                    Info: true,
                },
            } satisfies SecurityIssueFilters)
            const hiddenSeverities = securityTreeViewFilterState.getHiddenSeverities()
            assert.deepStrictEqual(hiddenSeverities, ['High', 'Low'])
        })
    })

    describe('CodeIssueGroupingStrategyState', function () {
        let sandbox: sinon.SinonSandbox
        let state: CodeIssueGroupingStrategyState

        beforeEach(function () {
            sandbox = sinon.createSandbox()
            state = CodeIssueGroupingStrategyState.instance
        })

        afterEach(function () {
            sandbox.restore()
        })

        describe('instance', function () {
            it('should return the same instance when called multiple times', function () {
                const instance1 = CodeIssueGroupingStrategyState.instance
                const instance2 = CodeIssueGroupingStrategyState.instance
                assert.strictEqual(instance1, instance2)
            })
        })

        describe('getState', function () {
            it('should return fallback when no state is stored', function () {
                const result = state.getState()

                assert.equal(result, CodeIssueGroupingStrategy.Severity)
            })

            it('should return stored state when valid', async function () {
                const validStrategy = CodeIssueGroupingStrategy.FileLocation
                await state.setState(validStrategy)

                const result = state.getState()

                assert.equal(result, validStrategy)
            })

            it('should return fallback when stored state is invalid', async function () {
                const invalidStrategy = 'invalid'
                await state.setState(invalidStrategy)

                const result = state.getState()

                assert.equal(result, CodeIssueGroupingStrategy.Severity)
            })
        })

        describe('setState', function () {
            it('should update state and fire change event for valid strategy', async function () {
                const validStrategy = CodeIssueGroupingStrategy.FileLocation

                // Create a spy to watch for event emissions
                const eventSpy = sandbox.spy()
                state.onDidChangeState(eventSpy)

                await state.setState(validStrategy)

                sinon.assert.calledWith(eventSpy, validStrategy)
            })

            it('should use fallback and fire change event for invalid strategy', async function () {
                const invalidStrategy = 'invalid'

                // Create a spy to watch for event emissions
                const eventSpy = sandbox.spy()
                state.onDidChangeState(eventSpy)

                await state.setState(invalidStrategy)

                sinon.assert.calledWith(eventSpy, CodeIssueGroupingStrategy.Severity)
            })
        })

        describe('reset', function () {
            it('should set state to fallback value', async function () {
                const setStateStub = sandbox.stub(state, 'setState').resolves()

                await state.reset()

                sinon.assert.calledWith(setStateStub, CodeIssueGroupingStrategy.Severity)
            })
        })

        describe('onDidChangeState', function () {
            it('should allow subscribing to state changes', async function () {
                const listener = sandbox.spy()
                const disposable = state.onDidChangeState(listener)

                await state.setState(CodeIssueGroupingStrategy.Severity)

                sinon.assert.calledWith(listener, CodeIssueGroupingStrategy.Severity)
                disposable.dispose()
            })
        })
    })
})
