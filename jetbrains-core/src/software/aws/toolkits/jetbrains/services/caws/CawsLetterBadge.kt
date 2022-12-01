// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBFont
import com.intellij.util.ui.MacUIUtil
import org.jdesktop.swingx.graphics.ColorUtilities
import software.amazon.awssdk.services.codecatalyst.model.CodeCatalystException
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import java.awt.Color
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.geom.Ellipse2D
import javax.swing.JLabel
import javax.swing.SwingConstants

class CawsLetterBadge(connectionSettings: ClientConnectionSettings<*>) : JLabel() {
    private val displayName: String
    init {
        val (displayName, email) = try {
            AwsResourceCache.getInstance().getResourceNow(CawsResources.PERSON, connectionSettings).let {
                it.displayName() to it.primaryEmail().email()
            }
        } catch (e: CodeCatalystException) {
            LOG.warn(e) { "Exception occurred while fetching user email" }
            "" to ""
        }
        this.displayName = displayName

        text = getInitials(displayName)
        font = JBFont.h3().asBold()
        foreground = JBColor(Color.WHITE, Color.BLACK)
        horizontalAlignment = SwingConstants.CENTER
        isOpaque = false
        preferredSize = Dimension(32, 32)

        addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent?) {
                JBPopupFactory.getInstance()
                    .createActionGroupPopup(
                        email,
                        ActionManager.getInstance().getAction("aws.toolkit.sono.id.actions") as ActionGroup,
                        DataManager.getInstance().getDataContext(this@CawsLetterBadge),
                        null,
                        false
                    )
                    .showUnderneathOf(this@CawsLetterBadge)
            }
        })
    }

    private val color by lazy {
        color(displayName)
    }

    override fun paintComponent(g: Graphics) {
        g as Graphics2D
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.setRenderingHint(
            RenderingHints.KEY_STROKE_CONTROL,
            if (MacUIUtil.USE_QUARTZ) RenderingHints.VALUE_STROKE_PURE else RenderingHints.VALUE_STROKE_NORMALIZE
        )
        g.color = color

        // we can probably do math to figure out the center of the letter but that is too much work right now
        val circle = Ellipse2D.Double(0.0, 0.0, width.toDouble(), height.toDouble())
        g.fill(circle)

        ui.paint(g, this)
    }

    companion object {
        private val LOG = getLogger<CawsLetterBadge>()

        // shamelessly stolen from Avatar defined in CAWSUIComponents
        private val nameReplaceRegex = Regex("[&/\\#,+()$~%.'\":*?<>{}0-9]")
        private fun getInitials(name: String): String {
            val names = name.replace(nameReplaceRegex, "")
                .split(" ")
                .filter { it.length > 0 }

            if (names.size == 0) {
                return "${name.firstOrNull() ?: ""}"
            }
            val firstInitial = names.first().first()
            if (names.size == 1) {
                return "$firstInitial"
            }
            val lastInitial = names.last().first()

            return "$firstInitial$lastInitial"
        }

        private fun hue(string: String): Int {
            val hash = string.fold(7) { hash, char ->
                (hash shl 5) - hash + char.toString().codePointAt(0)
            }

            return (Math.abs(hash) % 36) * 10 + 10
        }

        private const val saturation = 0.65f
        private const val luminosity = 0.35f
        private const val luminosity_dark = 0.75f
        private fun color(string: String): Color {
            val hue = hue(string) / 360f

            return JBColor(
                ColorUtilities.HSLtoRGB(hue, saturation, luminosity),
                ColorUtilities.HSLtoRGB(hue, saturation, luminosity_dark)
            )
        }
    }
}
