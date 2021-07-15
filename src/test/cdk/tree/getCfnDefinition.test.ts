import * as assert from 'assert'
import * as getCfnDefinition from '../../../cdk/explorer/nodes/getCfnDefinition'

const unescapedJsonString: string = `{"StartAt":"Submit Job","States":{"Submit Job":{"Next":"Wait X Seconds","Type":"Task","Resource":"SubmitJobFB773A16","ResultPath":"$.guid"},"Wait X Seconds":{"Type":"Wait","SecondsPath":"$.wait_time","Next":"Get Job Status"},"Get Job Status":{"Next":"Job Complete?","InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F","ResultPath":"$.status"},"Job Complete?":{"Type":"Choice","Choices":[{"Variable":"$.status","StringEquals":"FAILED","Next":"Job Failed"},{"Variable":"$.status","StringEquals":"SUCCEEDED","Next":"Get Final Job Status"}],"Default":"Wait X Seconds"},"Job Failed":{"Type":"Fail","Error":"DescribeJob returned FAILED","Cause":"AWS Batch Job Failed"},"Get Final Job Status":{"End":true,"InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F"}},"TimeoutSeconds":30}`
const uniqueIdendifier = 'MyStateMachine'
const cdkOutPath = __dirname.replace('/dist', '') + '/resources'
const stackName = 'templateJsonTester'

describe('CDK GetCfnDefinition for State Machines', function () {
    console.log(cdkOutPath)
    it('get the correct cfn definition for state machine with correct inputs', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, cdkOutPath, stackName)
        assert.strictEqual(unescapedJsonString, data)
    })

    it('get error message with wrong uniqueIdentifier', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier + '.', cdkOutPath, stackName)
        const errorMessage = 'Wrong state machine identifier'
        assert.strictEqual(data, errorMessage)
    })

    it('get error message with wrong cdkOutPath', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, cdkOutPath + '.', stackName)
        const errorMessage = 'Unable to get cfn definition for state machine'
        assert.strictEqual(data, errorMessage)
    })

    it('get error message with wrong stack name', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, cdkOutPath, stackName + '.')
        const errorMessage = 'Unable to get cfn definition for state machine'
        assert.strictEqual(data, errorMessage)
    })

})