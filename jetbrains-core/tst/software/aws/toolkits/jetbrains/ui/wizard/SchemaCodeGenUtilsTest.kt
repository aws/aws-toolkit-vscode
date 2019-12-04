// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

// TODO: This is fragile. Very fragle. But it is necessary to get Schemas service launched, and we've evaluated all other tradeoffs
// This will be done on the server-side as soon as we can, but for now the client needs to do this
class SchemaCodeGenUtilsTest {

    @Test
    public fun awsEventPackageName() {
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("aws.ec2.EC2InstanceStateChangeNotificationEvent"))
            .isEqualTo("schema.aws.ec2.ec2instancestatechangenotificationevent")
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("aws.ec2@EC2InstanceStateChangeNotificationEvent"))
            .isEqualTo("schema.aws.ec2.ec2instancestatechangenotificationevent")
    }

    @Test
    public fun partnerEventPackageName() {
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("aws.partner-mongodb.com/1234567-tickets@TicketCreated"))
            .isEqualTo("schema.aws.partner.mongodb_com_1234567_tickets.ticketcreated")
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("aws.partner-zendesk.com/some#other#special#chars@MyEvent"))
            .isEqualTo("schema.aws.partner.zendesk_com_some_other_special_chars.myevent")
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("aws.partner-pagerduty.com@YouGotPaged"))
            .isEqualTo("schema.aws.partner.pagerduty_com.yougotpaged")
    }

    @Test
    public fun customerUploadedEventPackageName() {
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("MyEvent"))
            .isEqualTo("schema.myevent")
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("MyEvent.Special#Characters${'$'}etc"))
            .isEqualTo("schema.myevent_special_characters_etc")
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("MyEvent@Discriminator"))
            .isEqualTo("schema.myevent.discriminator")
        assertThat(SchemaCodeGenUtils.buildSchemaPackageName("MyEvent@Discriminator@Another"))
            .isEqualTo("schema.myevent.discriminator.another")
    }

    @Test
    public fun formatIdentifier() {
        assertThat(SchemaCodeGenUtils.IdentifierFormatter.toValidIdentifier("Review.created"))
            .isEqualTo("Review_created")
    }
}
