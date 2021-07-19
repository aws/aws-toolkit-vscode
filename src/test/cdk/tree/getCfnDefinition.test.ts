import * as assert from 'assert'
import * as getCfnDefinition from '../../../cdk/explorer/nodes/getCfnDefinition'

const unescapedJsonString: string = `{"StartAt":"Submit Job","States":{"Submit Job":{"Next":"Wait X Seconds","Type":"Task","Resource":"SubmitJobFB773A16","ResultPath":"$.guid"},"Wait X Seconds":{"Type":"Wait","SecondsPath":"$.wait_time","Next":"Get Job Status"},"Get Job Status":{"Next":"Job Complete?","InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F","ResultPath":"$.status"},"Job Complete?":{"Type":"Choice","Choices":[{"Variable":"$.status","StringEquals":"FAILED","Next":"Job Failed"},{"Variable":"$.status","StringEquals":"SUCCEEDED","Next":"Get Final Job Status"}],"Default":"Wait X Seconds"},"Job Failed":{"Type":"Fail","Error":"DescribeJob returned FAILED","Cause":"AWS Batch Job Failed"},"Get Final Job Status":{"End":true,"InputPath":"$.guid","Type":"Task","Resource":"CheckJob5FFC1D6F"}},"TimeoutSeconds":30}`
const uniqueIdendifier = 'MyStateMachine'
const cdkOutPath = __dirname.replace('/dist', '') + '/resources'
const stackName = 'templateJsonTester'
const templatePath = cdkOutPath + `/${stackName}.template.json`

describe('CDK GetCfnDefinition for State Machines', function () {
    console.log(cdkOutPath)
    it('get the correct cfn definition for state machine with correct inputs', async function () {
        var data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, templatePath)
        data = getCfnDefinition.toUnescapedAslJson(data!)
        assert.strictEqual(unescapedJsonString, data)
    })

    it('return undefined with wrong uniqueIdentifier', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier + '.', templatePath)
        assert.strictEqual(data, undefined)
    })

    it('return undefined with wrong templatePath', async function () {
        const data = getCfnDefinition.getStateMachineDefinitionFromCfnTemplate(uniqueIdendifier, templatePath + 'x')
        console.log(data)
        assert.strictEqual(data, undefined)
    })

})
