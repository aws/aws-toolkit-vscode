// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.constants

import com.intellij.ui.JBColor
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil
import java.awt.Color
import java.awt.GridBagConstraints
import javax.swing.BorderFactory

class CodeModernizerUIConstants {

    object HEADER {
        const val PADDING_TOP = 7
        const val PADDING_RIGHT = 14
        const val PADDING_BOTTOM = 7
        const val PADDING_LEFT = 14
        const val FONT_SIZE = 14.0f
    }

    object SCROLL_PANEL {
        const val PADDING_TOP = 7
        const val PADDING_RIGHT = 14
        const val PADDING_BOTTOM = 7
        const val PADDING_LEFT = 14
    }

    object PLAN_CONSTRAINTS {
        const val PLAN_PADDING_TOP = 50
        const val PLAN_PADDING_LEFT = 50
        const val PLAN_PADDING_BOTTOM = 50
        const val PLAN_PADDING_RIGHT = 50

        const val TITLE_FONT_SIZE = 24f
        const val TRANSFORMATION_STEP_TITLE_FONT_SIZE = 14f
        const val STEP_FONT_SIZE = 14f

        const val NAME_PADDING_TOP = 10
        const val NAME_PADDING_LEFT = 10
        const val NAME_PADDING_BOTTOM = 10
        const val NAME_PADDING_RIGHT = 10

        const val DESCRP_PADDING_TOP = 0
        const val DESCRP_PADDING_LEFT = 10
        const val DESCRP_PADDING_BOTTOM = 10
        const val DESCRP_PADDING_RIGHT = 10
    }

    object FONT_CONSTRAINTS {
        const val BOLD = 1
        const val ITALIC = 2
    }

    companion object {
        const val SINGLE_SPACE_STRING: String = " "
        const val EMPTY_SPACE_STRING: String = ""
        val transformationPlanPlaneConstraint = GridBagConstraints().apply {
            gridx = 0
            weightx = 1.0
            weighty = 0.0
            fill = GridBagConstraints.HORIZONTAL
            anchor = GridBagConstraints.NORTH
        }
        val TRANSFORMATION_PLAN_PANEL_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createEmptyBorder(10, 10, 10, 10),
            BorderFactory.createLineBorder(CodeWhispererColorUtil.POPUP_BUTTON_BORDER, 1, true)

        )
        val STEP_INTRO_BORDER = BorderFactory.createEmptyBorder(10, 10, 10, 10)
        val STEP_INTRO_TITLE_BORDER = BorderFactory.createEmptyBorder(0, 0, 5, 0)
        val TRANSFORMATION_STEP_PANEL_COMPOUND_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(0, 20, 20, 20),
                BorderFactory.createLineBorder(Color.GRAY, 1, true)
            ),
            BorderFactory.createEmptyBorder(5, 5, 5, 5)
        )
        val TRANSFORMATION_STEPS_INFO_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(0, 10, 0, 0),
                BorderFactory.createLineBorder(Color.GRAY, 1, true)
            ),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        )
        val TRANSFORMATION_STEPS_INFO_AWSQ_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(0, 0, 0, 10),
                BorderFactory.createLineBorder(Color.GRAY, 1, true)
            ),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        )
        val TRANSOFORMATION_PLAN_INFO_BORDER = BorderFactory.createEmptyBorder(10, 10, 10, 10)
        val FILLER_CONSTRAINT = GridBagConstraints().apply {
            gridy = 1
            weighty = 1.0
        }

        fun getGreenThemeFontColor(): Color = if (JBColor.isBright()) JBColor.GREEN.darker() else JBColor.GREEN
        fun getRedThemeFontColor(): Color = JBColor.RED
        fun getStepIcon() = if (JBColor.isBright()) AwsIcons.CodeTransform.TIMELINE_STEP_LIGHT else AwsIcons.CodeTransform.TIMELINE_STEP_DARK
    }
}
