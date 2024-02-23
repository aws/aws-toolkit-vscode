// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ValidationInfo
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.resources.message
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import javax.swing.JPanel
import javax.swing.JSlider
import javax.swing.JTextField

// A panel with a slider and text field, of which the slider and text field always synced up.
class SliderPanel(
    private val min: Int,
    private val max: Int,
    defaultValue: Int = min,
    minTick: Int = min,
    maxTick: Int = max,
    minorTick: Int = (max - min) / 30,
    majorTick: Int = (max - min) / 5,
    snap: Boolean = false
) {
    @Suppress("UnusedPrivateMember") // root element must be bound
    private lateinit var content: JPanel
    lateinit var slider: JSlider
        private set
    lateinit var textField: JTextField
        private set

    init {
        slider.majorTickSpacing = majorTick
        slider.minorTickSpacing = minorTick
        slider.maximum = maxTick
        slider.minimum = minTick
        slider.paintLabels = true
        slider.snapToTicks = snap
        slider.value = defaultValue
        slider.addChangeListener { textField.text = validValue(slider.value).toString() }
        textField.text = slider.value.toString()
        textField.addFocusListener(
            object : FocusAdapter() {
                // When the text field lost focus, we force the value to be valid to reset to
                // - default value if the input is not a valid integer, or
                // - min if it is smaller than min, or
                // - max if it is bigger than max.
                override fun focusLost(e: FocusEvent) {
                    val value = validValue(textField.text.toInt())
                    slider.value = value
                    textField.text = value.toString()
                }
            }
        )
    }

    var value: Int
        get() = slider.value
        set(value) {
            slider.value = value
        }

    fun validate(): ValidationInfo? {
        val value = textField.text.toIntOrNull()
        return if (value == null || value < min || value > max) {
            ValidationInfo(message("lambda.slider_validation", min, max), textField)
        } else {
            null
        }
    }

    fun setEnabled(enabled: Boolean) {
        slider.isEnabled = enabled
        textField.isEnabled = enabled
    }

    @get:TestOnly
    val isVisible: Boolean
        get() = slider.parent.isVisible && slider.isVisible && textField.isVisible

    private fun validValue(originalValue: Int): Int = originalValue.coerceAtMost(max).coerceAtLeast(min)
}
