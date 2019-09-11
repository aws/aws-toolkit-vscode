// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui;

import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.uiDesigner.core.GridConstraints;
import com.intellij.uiDesigner.core.GridLayoutManager;
import java.awt.Dimension;
import java.awt.Insets;
import javax.swing.JComponent;
import org.jetbrains.annotations.TestOnly;

import javax.swing.JPanel;
import javax.swing.JSlider;
import javax.swing.JTextField;
import java.awt.event.FocusAdapter;
import java.awt.event.FocusEvent;

import static software.aws.toolkits.resources.Localization.message;

// A panel with a slider and text field, of which the slider and text field always synced up.
public class SliderPanel {
    private final int min, max, minTick, maxTick, minorTick, majorTick, defaultValue;
    private final boolean snap;

    private JPanel content;
    public JSlider slider;
    public JTextField textField;

    public SliderPanel(int min, int max, int defaultValue, int minTick, int maxTick, int minorTick, int majorTick, boolean snap) {
        this.min = min;
        this.max = max;
        this.defaultValue = defaultValue;
        this.minTick = minTick;
        this.maxTick = maxTick;
        this.minorTick = minorTick;
        this.majorTick = majorTick;
        this.snap = snap;
        bind();
    }

    public void setValue(int value) {
        slider.setValue(value);
    }

    public int getValue() {
        return slider.getValue();
    }

    public ValidationInfo validate() {
        Integer value = null;
        try {
            value = Integer.parseInt(textField.getText());
        } catch (Exception ignored) {
        }

        if (value == null || value < min || value > max) {
            return new ValidationInfo(message("lambda.slider_validation", min, max), textField);
        }
        return null;
    }

    public void setEnabled(Boolean enabled) {
        slider.setEnabled(enabled);
        textField.setEnabled(enabled);
    }

    @TestOnly
    public boolean isVisible() {
        return slider.getParent().isVisible() && slider.isVisible() && textField.isVisible();
    }

    private void bind() {
        slider.setMajorTickSpacing(majorTick);
        slider.setMinorTickSpacing(minorTick);
        slider.setMaximum(maxTick);
        slider.setMinimum(minTick);
        slider.setPaintLabels(true);
        slider.setSnapToTicks(snap);
        slider.setValue(defaultValue);
        slider.addChangeListener(e ->
                                     textField.setText(Integer.toString(validValue(slider.getValue())))
        );
        textField.setText(Integer.toString(slider.getValue()));
        textField.addFocusListener(new FocusAdapter() {
            // When the text field lost focus, we force the value to be valid to reset to
            // - default value if the input is not a valid integer, or
            // - min if it is smaller than min, or
            // - max if it is bigger than max.
            @Override
            public void focusLost(FocusEvent e) {
                int value;
                try {
                    value = validValue(Integer.parseInt(textField.getText()));
                } catch (Exception e2) {
                    value = defaultValue;
                }
                slider.setValue(value);
                textField.setText(Integer.toString(value));
            }
        });
    }

    private int validValue(int originalValue) {
        if (originalValue < min) {
            return min;
        } else if (originalValue > max) {
            return max;
        } else {
            return originalValue;
        }
    }

}
