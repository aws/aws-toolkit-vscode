// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.ui

import java.awt.event.AdjustmentEvent
import java.awt.event.AdjustmentListener
import javax.swing.JScrollBar
import javax.swing.JScrollPane

fun JScrollPane.topReached(block: () -> Unit) {
    verticalScrollBar.addAdjustmentListener(object : AdjustmentListener {
        var lastAdjustment = verticalScrollBar.minimum
        override fun adjustmentValueChanged(e: AdjustmentEvent?) {
            if (e == null || e.value == lastAdjustment) {
                return
            }
            lastAdjustment = e.value
            if (verticalScrollBar.isAtTop()) {
                block()
            }
        }
    })
}

fun JScrollPane.bottomReached(block: () -> Unit) {
    verticalScrollBar.addAdjustmentListener(object : AdjustmentListener {
        var lastAdjustment = verticalScrollBar.minimum
        override fun adjustmentValueChanged(e: AdjustmentEvent?) {
            if (e == null || e.value == lastAdjustment) {
                return
            }
            lastAdjustment = e.value
            if (verticalScrollBar.isAtBottom()) {
                block()
            }
        }
    })
}

private fun JScrollBar.isAtBottom(): Boolean = value == (maximum - visibleAmount)
private fun JScrollBar.isAtTop(): Boolean = value == minimum
