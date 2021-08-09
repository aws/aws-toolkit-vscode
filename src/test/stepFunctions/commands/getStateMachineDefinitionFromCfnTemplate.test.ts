/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as getCfnDefinition from '../../../stepFunctions/commands/visualizeStateMachine/getStateMachineDefinitionFromCfnTemplate'

const unescapedJsonString: string = `{"StartAt":"Submit Job","States":{"Submit Job":{"Next":"Wait X Seconds","Type":"Task","Resource":"","ResultPath":"$.guid"},"Wait X Seconds":{"Type":"Wait","SecondsPath":"$.wait_time","Next":"Get Job Status"},"Get Job Status":{"Next":"Job Complete?","InputPath":"$.guid","Type":"Task","Resource":"","ResultPath":"$.status"},"Job Complete?":{"Type":"Choice","Choices":[{"Variable":"$.status","StringEquals":"FAILED","Next":"Job Failed"},{"Variable":"$.status","StringEquals":"SUCCEEDED","Next":"Get Final Job Status"}],"Default":"Wait X Seconds"},"Job Failed":{"Type":"Fail","Error":"DescribeJob returned FAILED","Cause":"AWS Batch Job Failed"},"Get Final Job Status":{"End":true,"InputPath":"$.guid","Type":"Task","Resource":""}},"TimeoutSeconds":30}`
const uniqueIdendifier = 'MyStateMachine'
const cdkOutPath = __dirname.replace('/dist', '') + '/resources'
const stackName = 'templateJsonTester'
const templatePath = cdkOutPath + `/${stackName}.template.json`

describe('CDK GetCfnDefinition for State Machines', function () {
    it('get the correct cfn definition for state machine with correct inputs', async function () {
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, templatePath)
        //can i do this without this process????? and do assert.strictEqual(data , escapedJsonString)
        data = getCfnDefinition.toUnescapedAslJsonString(data as string)
        assert.strictEqual(data , unescapedJsonString)
    })

    it('return undefined with wrong templatePath', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, templatePath + '/wrongpath')
        assert.strictEqual(data, undefined)
    })

    it('return undefined with non existing uniqueIdentifier', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier + 'wrongidentifier', templatePath)
        assert.strictEqual(data, undefined)
    })

    it('fetch the correct state machine with similar state machine names', async function () {
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('MyStateMachine2', templatePath)
        //can i do this without this process????? and do assert.strictEqual(data , escapedJsonString)
        data = getCfnDefinition.toUnescapedAslJsonString(data as string)
        assert.strictEqual(data , unescapedJsonString)
    })

    it('catches error', async function () {
        //need this case?
    })

})

describe('Escaped JSON String to Unescaped ASL>JSON String', function () {
    it('escaped json string not containing any of refRegExp, refRegExp2, fnGetAttRegExp, and fnGetAttRegExp2', async function () {
        //"{\"StartAt\":\"GreetedWorld\",\"States\":{\"GreetedWorld\":{\"Type\":\"Succeed\"}}}"
        const unescapedTesterString = '{"StartAt":"GreetedWorld","States":{"GreetedWorld":{"Type":"Succeed"}}}'
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('NoRefNoFnGetStateMachine', templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data as string)
        assert.strictEqual(data , unescapedTesterString)
    })

    it('escaped json string not containing any of refRegExp, refRegExp2 and containing fnGetAttRegExp', async function () {
    })

    it('escaped json string not containing any of refRegExp, refRegExp2 and containing fnGetAttRegExp2', async function () {
    })

    it('escaped json string containing refRegExp and not containing any of fnGetAttRegExp, fnGetAttRegExp2', async function () {
    })

    it('escaped json string containing refRegExp and containing fnGetAttRegExp', async function () {
    })

    it('escaped json string containing refRegExp and containing fnGetAttRegExp2', async function () {
//         "{\"StartAt\":\"MyLambdaTask\",\"States\":{\"MyLambdaTask\":{\"Next\":\"GreetedWorld\",\"Retry\":[{\"ErrorEquals\":[\"Lambda.ServiceException\",\"Lambda.AWSLambdaException\",\"Lambda.SdkClientException\"],\"IntervalSeconds\":2,\"MaxAttempts\":6,\"BackoffRate\":2}],\"Type\":\"Task\",\"Resource\":\"arn:",
//   {
//     "Ref": "AWS::Partition"
//   },
//   ":states:::lambda:invoke\",\"Parameters\":{\"FunctionName\":\"",
//   {
//     "Fn::GetAtt": [
//       "MyLambdaFunction67CCA873",
//       "Arn"
//     ]
//   },
//   "\",\"Payload.$\":\"$\"}},\"GreetedWorld\":{\"Type\":\"Succeed\"}}}"

        //{"StartAt":"MyLambdaTask","States":{"MyLambdaTask":{"Next":"GreetedWorld","Retry":[{"ErrorEquals":["Lambda.ServiceException","Lambda.AWSLambdaException","Lambda.SdkClientException"],"IntervalSeconds":2,"MaxAttempts":6,"BackoffRate":2}],"Type":"Task","Resource":"arn:","Parameters":{"FunctionName":"","Payload.$":"$"}},"GreetedWorld":{"Type":"Succeed"}}}
    })

    it('escaped json string containing refRegExp2 and not containing any of fnGetAttRegExp, fnGetAttRegExp2', async function () {
    })

    it('escaped json string containing refRegExp2 and containing fnGetAttRegExp', async function () {
    })

    it('escaped json string containing refRegExp, refRegExp2, and fnGetAttRegExp', async function () {
        const unescapedTesterString = '{"StartAt":"Convert to seconds","States":{"Convert to seconds":{"Next":"Publish message","Type":"Task","ResultPath":"$.waitSeconds","Resource":"","Parameters":{"expression":"$.waitMilliseconds / 1000","expressionAttributeValues":{"$.waitMilliseconds.$":"$.waitMilliseconds"}}},"Publish message":{"End":true,"Type":"Task","ResultPath":"$.sns","Resource":"arn:","Parameters":{"TopicArn":"","Message.$":"$.message"}}}}'
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('RefandFnStateMachine', templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data as string)
        assert.strictEqual(data , unescapedTesterString)
    })

    it('escaped json string containing refRegExp, refRegExp2, and fnGetAttRegExp2', async function () {
        const unescapedTesterString = '{"StartAt":"Convert to seconds","States":{"Convert to seconds":{"Next":"Publish message","Type":"Task","ResultPath":"$.waitSeconds","Resource":"","Parameters":{"expression":"$.waitMilliseconds / 1000","expressionAttributeValues":{"$.waitMilliseconds.$":"$.waitMilliseconds"}}},"Publish message":{"End":true,"Type":"Task","ResultPath":"$.sns","Resource":"arn:","Parameters":{"TopicArn":"","Message.$":"$.message"}}}}'
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('Ref2andFnStateMachine', templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data as string)
        assert.strictEqual(data , unescapedTesterString)
    })
})
