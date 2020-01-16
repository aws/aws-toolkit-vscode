/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { IdentifierFormatter, SchemaCodeGenUtils } from '../../../eventSchemas/models/schemaCodeGenUtils'

describe('awsEventPackageName', async () => {
    it('should build aws event package name', async () => {
        const codeGen = new SchemaCodeGenUtils()
        const actual1 = codeGen.buildSchemaPackageName('aws.ec2.EC2InstanceStateChangeNotificationEvent')
        const actual2 = codeGen.buildSchemaPackageName('aws.ec2@EC2InstanceStateChangeNotificationEvent')
        const expected = 'schema.aws.ec2.ec2instancestatechangenotificationevent'

        assert.strictEqual(actual1, expected)
        assert.strictEqual(actual2, expected)
    })
})

describe('partnerEventPackageName', async () => {
    it('should build partner event package name', async () => {
        const codeGen = new SchemaCodeGenUtils()
        const actual1 = codeGen.buildSchemaPackageName('aws.partner-mongodb.com/1234567-tickets@TicketCreated')
        const actual2 = codeGen.buildSchemaPackageName('aws.partner-zendesk.com/some#other#special#chars@MyEvent')
        const actual3 = codeGen.buildSchemaPackageName('aws.partner-pagerduty.com@YouGotPaged')

        const expected1 = 'schema.aws.partner.mongodb_com_1234567_tickets.ticketcreated'
        const expected2 = 'schema.aws.partner.zendesk_com_some_other_special_chars.myevent'
        const expected3 = 'schema.aws.partner.pagerduty_com.yougotpaged'

        assert.strictEqual(actual1, expected1)
        assert.strictEqual(actual2, expected2)
        assert.strictEqual(actual3, expected3)
    })
})

describe('customerUploadedEventPackageName', async () => {
    it('should build custom event package name', async () => {
        const codeGen = new SchemaCodeGenUtils()
        const actual1 = codeGen.buildSchemaPackageName('MyEvent')
        const actual2 = codeGen.buildSchemaPackageName('MyEvent.Special#Characters$etc')
        const actual3 = codeGen.buildSchemaPackageName('MyEvent@Discriminator')
        const actual4 = codeGen.buildSchemaPackageName('MyEvent@Discriminator@Another')

        const expected1 = 'schema.myevent'
        const expected2 = 'schema.myevent_special_characters_etc'
        const expected3 = 'schema.myevent.discriminator'
        const expected4 = 'schema.myevent.discriminator.another'

        assert.strictEqual(actual1, expected1)
        assert.strictEqual(actual2, expected2)
        assert.strictEqual(actual3, expected3)
        assert.strictEqual(actual4, expected4)
    })
})

describe('formatIdentifier', async () => {
    it('should build event package name', async () => {
        const formatter = new IdentifierFormatter()
        assert.strictEqual(formatter.toValidIdentifier('Review.created'), 'Review_created')
    })
})
