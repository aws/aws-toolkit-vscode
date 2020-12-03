// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.ide.HelpTooltip
import com.intellij.ui.components.fields.IntegerField
import software.aws.toolkits.jetbrains.ui.SliderPanel
import software.aws.toolkits.resources.message
import javax.swing.JPanel

class EditAttributesPanel {
    lateinit var component: JPanel
        private set
    lateinit var visibilityTimeout: SliderPanel
        private set
    lateinit var messageSize: IntegerField
        private set
    lateinit var retentionPeriod: IntegerField
        private set
    lateinit var deliveryDelay: SliderPanel
        private set
    lateinit var waitTime: SliderPanel
        private set

    private fun createUIComponents() {
        visibilityTimeout = SliderPanel(
            MIN_VISIBILITY_TIMEOUT,
            MAX_VISIBILITY_TIMEOUT,
            MIN_VISIBILITY_TIMEOUT,
            MIN_VISIBILITY_TIMEOUT,
            MAX_VISIBILITY_TIMEOUT,
            VISIBILITY_TIMEOUT_TICK,
            VISIBILITY_TIMEOUT_TICK * 5,
            false
        )
        IntegerField("", MIN_VISIBILITY_TIMEOUT, MAX_VISIBILITY_TIMEOUT)
        HelpTooltip().apply {
            setDescription(message("sqs.edit.attributes.visibility_timeout.tooltip"))
            installOn(visibilityTimeout.slider)
            installOn(visibilityTimeout.textField)
        }
        messageSize = IntegerField("", MIN_MESSAGE_SIZE_LIMIT, MAX_MESSAGE_SIZE_LIMIT)
        HelpTooltip().apply {
            setDescription(message("sqs.edit.attributes.message_size.tooltip", MIN_MESSAGE_SIZE_LIMIT, MAX_MESSAGE_SIZE_LIMIT))
            installOn(messageSize)
        }
        retentionPeriod = IntegerField("", MIN_RETENTION_PERIOD, MAX_RETENTION_PERIOD)
        HelpTooltip().apply {
            setDescription(message("sqs.edit.attributes.retention_period.tooltip", MIN_RETENTION_PERIOD, MAX_RETENTION_PERIOD))
            installOn(retentionPeriod)
        }
        deliveryDelay = SliderPanel(
            MIN_DELIVERY_DELAY,
            MAX_DELIVERY_DELAY,
            MIN_DELIVERY_DELAY,
            MIN_DELIVERY_DELAY,
            MAX_DELIVERY_DELAY,
            DELIVERY_DELAY_TICK,
            DELIVERY_DELAY_TICK * 5,
            false
        )
        IntegerField("", MIN_DELIVERY_DELAY, MAX_DELIVERY_DELAY)
        HelpTooltip().apply {
            setDescription(message("sqs.edit.attributes.delivery_delay.tooltip"))
            installOn(deliveryDelay.textField)
            installOn(deliveryDelay.slider)
        }
        waitTime = SliderPanel(MIN_WAIT_TIME, MAX_WAIT_TIME, MIN_WAIT_TIME, MIN_WAIT_TIME, MAX_WAIT_TIME, WAIT_TIME_TICK, WAIT_TIME_TICK * 5, true)
        HelpTooltip().apply {
            setDescription(message("sqs.edit.attributes.wait_time.tooltip"))
            installOn(waitTime.textField)
            installOn(waitTime.slider)
        }
    }
}
