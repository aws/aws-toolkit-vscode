/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as getCfnDefinition from '../../../stepFunctions/commands/visualizeStateMachine/getStateMachineDefinitionFromCfnTemplate'

import { normalize } from '../../../shared/utilities/pathUtils'

const unescapedJsonString: string = `{"StartAt":"Submit Job","States":{"Submit Job":{"Next":"Wait X Seconds","Type":"Task","Resource":"","ResultPath":"$.guid"},"Wait X Seconds":{"Type":"Wait","SecondsPath":"$.wait_time","Next":"Get Job Status"},"Get Job Status":{"Next":"Job Complete?","InputPath":"$.guid","Type":"Task","Resource":"","ResultPath":"$.status"},"Job Complete?":{"Type":"Choice","Choices":[{"Variable":"$.status","StringEquals":"FAILED","Next":"Job Failed"},{"Variable":"$.status","StringEquals":"SUCCEEDED","Next":"Get Final Job Status"}],"Default":"Wait X Seconds"},"Job Failed":{"Type":"Fail","Error":"DescribeJob returned FAILED","Cause":"AWS Batch Job Failed"},"Get Final Job Status":{"End":true,"InputPath":"$.guid","Type":"Task","Resource":""}},"TimeoutSeconds":30}`
const unescapedJsonString2: string = `{"StartAt":"Submit Job2","States":{"Submit Job2":{"Next":"Wait X Seconds","Type":"Task","Resource":"","ResultPath":"$.guid"},"Wait X Seconds":{"Type":"Wait","SecondsPath":"$.wait_time","Next":"Get Job Status"},"Get Job Status":{"Next":"Job Complete?","InputPath":"$.guid","Type":"Task","Resource":"","ResultPath":"$.status"},"Job Complete?":{"Type":"Choice","Choices":[{"Variable":"$.status","StringEquals":"FAILED","Next":"Job Failed"},{"Variable":"$.status","StringEquals":"SUCCEEDED","Next":"Get Final Job Status"}],"Default":"Wait X Seconds"},"Job Failed":{"Type":"Fail","Error":"DescribeJob returned FAILED","Cause":"AWS Batch Job Failed"},"Get Final Job Status":{"End":true,"InputPath":"$.guid","Type":"Task","Resource":""}},"TimeoutSeconds":30}`
const uniqueIdendifier = 'MyStateMachine'
const cdkOutPath = normalize(normalize(__dirname).replace('/dist', '') + '/resources')
const templatePath = normalize(`${cdkOutPath}/templateJsonTester.template.json`)

describe('Get State Machine Definition from Cfn Template', function () {
    it('get the correct cfn definition for state machine with correct inputs', function () {
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data)
        assert.strictEqual(data, unescapedJsonString)
    })

    it('fetch the correct state machine with similar state machine names', function () {
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('MyStateMachine2', templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data)
        assert.strictEqual(data, unescapedJsonString2)
    })

    it('return empty string with wrong templatePath', function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(
            uniqueIdendifier,
            templatePath + '/wrongpath'
        )
        assert.strictEqual(data, '')
    })

    it('return empty string with non-existing uniqueIdentifier', function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(
            uniqueIdendifier + 'wrongidentifier',
            templatePath
        )
        assert.strictEqual(data, '')
    })

    it('escaped json string not containing any of refRegExp, refRegExp2, fnGetAttRegExp, and fnGetAttRegExp2', function () {
        const unescapedTesterString = '{"StartAt":"GreetedWorld","States":{"GreetedWorld":{"Type":"Succeed"}}}'
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('NoRefNoFnGetStateMachine', templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data)
        assert.strictEqual(data, unescapedTesterString)
    })

    it('escaped json string containing refRegExp, refRegExp2, and fnGetAttRegExp', function () {
        const unescapedTesterString =
            '{"StartAt":"Convert to seconds","States":{"Convert to seconds":{"Next":"Publish message","Type":"Task","ResultPath":"$.waitSeconds","Resource":"randomString","Parameters":{"expression":"$.waitMilliseconds / 1000","expressionAttributeValues":{"$.waitMilliseconds.$":"$.waitMilliseconds"}}},"Publish message":{"End":true,"Type":"Task","ResultPath":"$.sns","Resource":"arn::states:::sns:publish","Parameters":{"TopicArn":"","Message.$":"$.message"}}}}'
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('RefandFnStateMachine', templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data)
        assert.strictEqual(data, unescapedTesterString)
    })

    it('escaped json string containing refRegExp, refRegExp2, and fnGetAttRegExp2', function () {
        const unescapedTesterString =
            '{"StartAt":"Convert to seconds","States":{"Convert to seconds":{"Next":"Publish message","Type":"Task","ResultPath":"$.waitSeconds","Resource":"","Parameters":{"expression":"$.waitMilliseconds / 1000","expressionAttributeValues":{"$.waitMilliseconds.$":"$.waitMilliseconds"}}},"Publish message":{"End":true,"Type":"Task","ResultPath":"$.sns","Resource":"arn::states:::sns:publish","Parameters":{"TopicArn":"","Message.$":"$.message"}}}}'
        let data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate('Ref2andFnStateMachine', templatePath)
        data = getCfnDefinition.toUnescapedAslJsonString(data)
        assert.strictEqual(data, unescapedTesterString)
    })
})
