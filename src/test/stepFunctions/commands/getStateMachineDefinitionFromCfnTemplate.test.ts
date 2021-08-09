/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as getCfnDefinition from '../../../stepFunctions/commands/visualizeStateMachine/getStateMachineDefinitionFromCfnTemplate'

const unescapedJsonString: string = `{"StartAt":"Submit Job","States":{"Submit Job":{"Next":"Wait X Seconds","Type":"Task","Resource":"SubmitJobFB773A16","ResultPath":"$.guid"},"Wait X Seconds":{"Type":"Wait","SecondsPath":"$.wait_time","Next":"Get Job Status"},"Get Job Status":{"Next":"Job Complete?","InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F","ResultPath":"$.status"},"Job Complete?":{"Type":"Choice","Choices":[{"Variable":"$.status","StringEquals":"FAILED","Next":"Job Failed"},{"Variable":"$.status","StringEquals":"SUCCEEDED","Next":"Get Final Job Status"}],"Default":"Wait X Seconds"},"Job Failed":{"Type":"Fail","Error":"DescribeJob returned FAILED","Cause":"AWS Batch Job Failed"},"Get Final Job Status":{"End":true,"InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F"}},"TimeoutSeconds":30}`
const escapedJsonString: string = 'update'
const uniqueIdendifier = 'MyStateMachine'
const cdkOutPath = __dirname.replace('/dist', '') + '/resources'
const stackName = 'templateJsonTester'
const templatePath = cdkOutPath + `/${stackName}.template.json`

describe('CDK GetCfnDefinition for State Machines', function () {
    it('get the correct cfn definition for state machine with correct inputs', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, templatePath)
        assert.strictEqual(escapedJsonString, data)
    })

    it('return undefined with non existing uniqueIdentifier', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier + '.', templatePath)
        assert.strictEqual(data, undefined)
    })

    it('return undefined with wrong templatePath', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, templatePath + 'x')
        assert.strictEqual(data, undefined)
    })

    it('fetch the correct state machine with similar state machine names', async function () {
    })

})

describe('escaped json string to unescaped asl.json string', function () {
    it('escaped json string not containing any of refRegExp, refRegExp2, fnGetAttRegExp, and fnGetAttRegExp2', async function () {
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
    })

    it('escaped json string containing refRegExp2 and not containing any of fnGetAttRegExp, fnGetAttRegExp2', async function () {
    })

    it('escaped json string containing refRegExp2 and containing fnGetAttRegExp', async function () {
    })

    it('escaped json string containing refRegExp2 and containing fnGetAttRegExp2', async function () {
    })
})
