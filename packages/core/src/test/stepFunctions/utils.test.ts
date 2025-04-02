/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { isDocumentValid, isStepFunctionsRole } from '../../stepFunctions/utils'
import { IamRole } from '../../shared/clients/iam'

describe('isStepFunctionsRole', function () {
    const baseIamRole: IamRole = {
        Path: '',
        RoleName: '',
        RoleId: 'myRole',
        Arn: 'arn:aws:iam::123456789012:role/myRole',
        CreateDate: new Date(),
    }

    it('return true if the Step Functions service principal is in the AssumeRolePolicyDocument', function () {
        const role: IamRole = {
            ...baseIamRole,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: ['states.amazonaws.com'],
                        },
                        Action: ['sts:AssumeRole'],
                    },
                ],
            }),
        }
        assert.ok(isStepFunctionsRole(role))
    })

    it('returns false if the role does not have an AssumeRolePolicyDocument', function () {
        assert.ok(!isStepFunctionsRole(baseIamRole))
    })

    it("returns false if the AssumeRolePolicyDocument does not contain Step Functions' service principal", () => {
        const role: IamRole = {
            ...baseIamRole,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: ['lambda.amazonaws.com'],
                        },
                        Action: ['sts:AssumeRole'],
                    },
                ],
            }),
        }
        assert.ok(!isStepFunctionsRole(role))
    })
})

describe('isDocumentValid', async function () {
    it('returns true for valid ASL', async function () {
        const aslText = `
            {
                "StartAt": "FirstMatchState",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns true for ASL with invalid arns', async function () {
        const aslText = `
            {
                "StartAt": "FirstMatchState",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns false for invalid ASL', async function () {
        const aslText = `
            {
                "StartAt": "Does not exist",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)

        assert.ok(!isValid)
    })
})
