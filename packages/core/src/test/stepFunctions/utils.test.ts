/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import {
    isDocumentValid,
    isStepFunctionsRole,
    isInvalidJsonFile,
    isInvalidYamlFile,
    isExpressExecution,
    parseExecutionArnForStateMachine,
} from '../../stepFunctions/utils'
import { IamRole } from '../../shared/clients/iam'

// Test Helpers
async function createTextDocument(language: string, content: string): Promise<vscode.TextDocument> {
    return await vscode.workspace.openTextDocument({
        language,
        content,
    })
}

function createValidAsl(startAt: string = 'FirstMatchState', customStates?: any): string {
    const defaultStates = {
        FirstMatchState: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch',
            End: true,
        },
    }

    return JSON.stringify({
        StartAt: startAt,
        States: customStates || defaultStates,
    })
}

function createInvalidAsl(): string {
    return JSON.stringify({
        StartAt: 'Does not exist',
        States: {
            FirstMatchState: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch',
                End: true,
            },
        },
    })
}

function createIamRoleWithPolicy(servicePrincipals: string[]): IamRole {
    const baseRole: IamRole = {
        Path: '',
        RoleName: '',
        RoleId: 'myRole',
        Arn: 'arn:aws:iam::123456789012:role/myRole',
        CreateDate: new Date(),
    }

    return {
        ...baseRole,
        AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: {
                        Service: servicePrincipals,
                    },
                    Action: ['sts:AssumeRole'],
                },
            ],
        }),
    }
}

describe('isStepFunctionsRole', function () {
    const baseIamRole: IamRole = {
        Path: '',
        RoleName: '',
        RoleId: 'myRole',
        Arn: 'arn:aws:iam::123456789012:role/myRole',
        CreateDate: new Date(),
    }

    it('return true if the Step Functions service principal is in the AssumeRolePolicyDocument', function () {
        const role = createIamRoleWithPolicy(['states.amazonaws.com'])
        assert.ok(isStepFunctionsRole(role))
    })

    it('returns false if the role does not have an AssumeRolePolicyDocument', function () {
        assert.ok(!isStepFunctionsRole(baseIamRole))
    })

    it("returns false if the AssumeRolePolicyDocument does not contain Step Functions' service principal", () => {
        const role = createIamRoleWithPolicy(['lambda.amazonaws.com'])
        assert.ok(!isStepFunctionsRole(role))
    })
})

describe('isDocumentValid', async function () {
    it('returns true for valid ASL', async function () {
        const aslText = createValidAsl()
        const textDocument = await createTextDocument('asl', '')

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns true for ASL with invalid arns', async function () {
        const aslText = createValidAsl('FirstMatchState', {
            FirstMatchState: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:REGION:ACCOUNT_ID:function:OnFirstMatch',
                End: true,
            },
        })
        const textDocument = await createTextDocument('asl', '')

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns false for invalid ASL', async function () {
        const aslText = createInvalidAsl()
        const textDocument = await createTextDocument('asl', '')

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(!isValid)
    })
})

describe('isInvalidJsonFile', function () {
    it('returns false for valid JSON with ASL language ID', async function () {
        const validJson = '{"StartAt": "Test", "States": {"Test": {"Type": "Pass", "End": true}}}'
        const textDocument = await createTextDocument('asl', validJson)

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns true for invalid JSON with ASL language ID', async function () {
        const invalidJson = '{"StartAt": "Test", "States": {'
        const textDocument = await createTextDocument('asl', invalidJson)

        assert.strictEqual(isInvalidJsonFile(textDocument), true)
    })

    it('returns false for empty content with ASL language ID', async function () {
        const textDocument = await createTextDocument('asl', '')

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns false for whitespace-only content with ASL language ID', async function () {
        const textDocument = await createTextDocument('asl', '   \n\t  ')

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns false for valid JSON with non-ASL language ID', async function () {
        const validJson = '{"test": "value"}'
        const textDocument = await createTextDocument('json', validJson)

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns false for invalid JSON with non-ASL language ID', async function () {
        const invalidJson = '{"test": invalid}'
        const textDocument = await createTextDocument('json', invalidJson)

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })
})

describe('isInvalidYamlFile', function () {
    it('returns false for valid YAML with ASL-YAML language ID', async function () {
        const validYaml = 'StartAt: Test\nStates:\n  Test:\n    Type: Pass\n    End: true'
        const textDocument = await createTextDocument('asl-yaml', validYaml)

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })

    it('returns true for invalid YAML with ASL-YAML language ID', async function () {
        const invalidYaml = 'StartAt: Test\nStates:\n  Test:\n    Type: Pass\n    End: true\n  - invalid list item'
        const textDocument = await createTextDocument('asl-yaml', invalidYaml)

        assert.strictEqual(isInvalidYamlFile(textDocument), true)
    })

    it('returns false for empty content with ASL-YAML language ID', async function () {
        const textDocument = await createTextDocument('asl-yaml', '')

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })

    it('returns false for valid YAML with non-ASL-YAML language ID', async function () {
        const validYaml = 'key: value\nlist:\n  - item1\n  - item2'
        const textDocument = await createTextDocument('yaml', validYaml)

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })

    it('returns false for invalid YAML with non-ASL-YAML language ID', async function () {
        const invalidYaml = 'key: value\n  - invalid'
        const textDocument = await createTextDocument('yaml', invalidYaml)

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })
})

describe('isExpressExecution', function () {
    it('returns true for express execution ARN', function () {
        const expressArn = 'arn:aws:states:us-east-1:123456789012:express:stateMachine:MyStateMachine:execution-name'
        assert.strictEqual(isExpressExecution(expressArn), true)
    })

    it('returns false for standard execution ARN', function () {
        const standardArn = 'arn:aws:states:us-west-2:987654321098:stateMachine:TestMachine:execution-id'
        assert.strictEqual(isExpressExecution(standardArn), false)
    })

    it('returns false for ARN with express format but different resource type', function () {
        const arnWithDifferentType =
            'arn:aws:states:us-east-1:123456789012:standard:stateMachine:MyStateMachine:execution-name'
        assert.strictEqual(isExpressExecution(arnWithDifferentType), false)
    })

    it('returns false for malformed ARN with wrong segment count', function () {
        const malformedArn = 'arn:aws:states:us-east-1:123456789012:stateMachine:execution-name'
        assert.strictEqual(isExpressExecution(malformedArn), false)
    })

    it('returns false for empty string', function () {
        assert.strictEqual(isExpressExecution(''), false)
    })

    it('returns false for ARN with correct segment count but no express type', function () {
        const arnWithoutExpress =
            'arn:aws:states:us-east-1:123456789012:other:stateMachine:MyStateMachine:execution-name'
        assert.strictEqual(isExpressExecution(arnWithoutExpress), false)
    })
})

describe('parseExecutionArnForStateMachine', function () {
    it('parses express execution ARN correctly', function () {
        const expressArn =
            'arn:aws:states:us-east-1:640351538274:express:testexpress:b46b000d-c25d-4bbe-98c7-ee48978cbc51:99df0098-6f92-468c-9429-a7798be2f8a7'
        const result = parseExecutionArnForStateMachine(expressArn)

        assert.ok(result)
        assert.strictEqual(result.region, 'us-east-1')
        assert.strictEqual(result.stateMachineName, 'testexpress')
        assert.strictEqual(result.stateMachineArn, 'arn:aws:states:us-east-1:640351538274:stateMachine:testexpress')
    })

    it('parses standard execution ARN correctly', function () {
        const standardArn = 'arn:aws:states:us-west-2:640351538274:execution:test:9738b8de-2433-414c-9182-95dd746b7b9e'
        const result = parseExecutionArnForStateMachine(standardArn)

        assert.ok(result)
        assert.strictEqual(result.region, 'us-west-2')
        assert.strictEqual(result.stateMachineName, 'test')
        assert.strictEqual(result.stateMachineArn, 'arn:aws:states:us-west-2:640351538274:stateMachine:test')
    })
})
