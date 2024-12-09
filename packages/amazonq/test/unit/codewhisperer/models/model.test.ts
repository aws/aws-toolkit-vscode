/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import { SecurityIssueFilters, SecurityTreeViewFilterState } from 'aws-core-vscode/codewhisperer'
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
})
