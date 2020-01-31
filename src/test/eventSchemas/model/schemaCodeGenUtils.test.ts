/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { IdentifierFormatter, SchemaCodeGenUtils } from '../../../eventSchemas/models/schemaCodeGenUtils'

describe('SchemaCodeGenUtils', async () => {
    const testScenarios = [
        {
            scenario: 'builds the "aws event" package name',
            input: 'aws.ec2.EC2InstanceStateChangeNotificationEvent',
            expectedResult: 'schema.aws.ec2.ec2instancestatechangenotificationevent'
        },
        {
            scenario: 'builds the "aws event" package name containing package seperator @',
            input: 'aws.ec2@EC2InstanceStateChangeNotificationEvent',
            expectedResult: 'schema.aws.ec2.ec2instancestatechangenotificationevent'
        },
        {
            scenario: 'builds the "partner event" package name containing slash,numbers,dash and package seperator @',
            input: 'aws.partner-mongodb.com/1234567-tickets@TicketCreated',
            expectedResult: 'schema.aws.partner.mongodb_com_1234567_tickets.ticketcreated'
        },
        {
            scenario: 'builds the "partner event" package name containing other special characters',
            input: 'aws.partner-zendesk.com/some#other?special;chars@MyEvent',
            expectedResult: 'schema.aws.partner.zendesk_com_some_other_special_chars.myevent'
        },
        {
            scenario: 'builds the "partner event" package name containing package seperator @ only',
            input: 'aws.partner-pagerduty.com@YouGotPaged',
            expectedResult: 'schema.aws.partner.pagerduty_com.yougotpaged'
        },
        {
            scenario: 'builds the "custom event" package name containing no special characters',
            input: 'MyEvent',
            expectedResult: 'schema.myevent'
        },
        {
            scenario: 'builds the "custom event" package name containing special characters',
            input: 'MyEvent.Special#Characters$etc',
            expectedResult: 'schema.myevent_special_characters_etc'
        },
        {
            scenario: 'builds the "custom event" package name containing package seperator',
            input: 'MyEvent@Discriminator',
            expectedResult: 'schema.myevent.discriminator'
        },
        {
            scenario: 'builds the "custom event" package name containing multiple package seperators',
            input: 'MyEvent@Discriminator@Another',
            expectedResult: 'schema.myevent.discriminator.another'
        }
    ]

    describe('buildSchemaPackageName', async () => {
        testScenarios.forEach(test => {
            it(test.scenario, async () => {
                const codeGen = new SchemaCodeGenUtils()
                const result = codeGen.buildSchemaPackageName(test.input)
                assert.strictEqual(result, test.expectedResult, 'Invalid package name returned')
            })
        })
    })
})

describe('IdentifierFormatter', async () => {
    describe('toValidIdentifier', async () => {
        it('replaces invalid identifier characters with underscore', async () => {
            assert.strictEqual(IdentifierFormatter.toValidIdentifier('Review.created?today'), 'Review_created_today')
        })

        it('replaces package seperator @ with dot', async () => {
            assert.strictEqual(IdentifierFormatter.toValidIdentifier('Review@created'), 'Review.created')
        })
    })
})
