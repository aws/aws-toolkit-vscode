// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.JBColor
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.jetbrains.utils.ui.BETTER_GREEN
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.SwingUtilities

interface View {
    val component: JComponent
}

/**
 * Pages of events
 */
enum class Page(val icon: Icon) {
    PREVIOUS(AllIcons.Actions.Back),
    NEXT(AllIcons.Actions.Forward)
}

enum class StatusType(val icon: Icon, val color: JBColor, private val animatedIconStrategy: (() -> AnimatedIcon)? = null) {
    UNKNOWN(AllIcons.RunConfigurations.TestUnknown, JBColor.BLACK),
    PROGRESS(AllIcons.Process.ProgressResume, JBColor.ORANGE, { AnimatedIcon.FS() }),
    COMPLETED(AllIcons.RunConfigurations.ToolbarPassed, BETTER_GREEN),
    DELETED(AllIcons.RunConfigurations.ToolbarSkipped, JBColor.GRAY),
    FAILED(AllIcons.RunConfigurations.ToolbarFailed, JBColor.RED);

    val animatedIconIfPossible: Icon get() = animatedIconStrategy?.let { it() } ?: icon

    companion object {
        fun fromStatusValue(value: String) =
            listOf(ResourceStatus.fromValue(value).type, StackStatus.fromValue(value).type).firstOrNull { it != UNKNOWN }
                ?: UNKNOWN
    }
}

internal val StackStatus.type: StatusType
    get() = when (this) {
        StackStatus.UPDATE_COMPLETE, StackStatus.CREATE_COMPLETE -> StatusType.COMPLETED
        StackStatus.UPDATE_IN_PROGRESS,
        StackStatus.CREATE_IN_PROGRESS,
        StackStatus.ROLLBACK_IN_PROGRESS,
        StackStatus.UPDATE_ROLLBACK_IN_PROGRESS,
        StackStatus.DELETE_IN_PROGRESS,
        StackStatus.REVIEW_IN_PROGRESS,
        StackStatus.UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS,
        StackStatus.UPDATE_COMPLETE_CLEANUP_IN_PROGRESS -> StatusType.PROGRESS
        StackStatus.DELETE_COMPLETE -> StatusType.DELETED
        StackStatus.ROLLBACK_COMPLETE,
        StackStatus.DELETE_FAILED,
        StackStatus.UPDATE_ROLLBACK_FAILED,
        StackStatus.ROLLBACK_FAILED,
        StackStatus.UPDATE_ROLLBACK_COMPLETE,
        StackStatus.CREATE_FAILED -> StatusType.FAILED
        else -> StatusType.UNKNOWN
    }

internal val ResourceStatus.type: StatusType
    get() = when (this) {
        ResourceStatus.CREATE_COMPLETE, ResourceStatus.UPDATE_COMPLETE -> StatusType.COMPLETED
        ResourceStatus.CREATE_FAILED, ResourceStatus.UPDATE_FAILED, ResourceStatus.DELETE_FAILED -> StatusType.FAILED
        ResourceStatus.DELETE_COMPLETE, ResourceStatus.DELETE_SKIPPED -> StatusType.DELETED
        ResourceStatus.CREATE_IN_PROGRESS, ResourceStatus.DELETE_IN_PROGRESS, ResourceStatus.UPDATE_IN_PROGRESS -> StatusType.PROGRESS
        else -> StatusType.UNKNOWN
    }

/**
 * [update] Function0<Unit> function to call to update icon
 */
internal data class IconInfo(val icon: Icon, val update: () -> Unit)

internal interface ViewWithIcons {
    fun getIconsAndUpdaters(): Collection<IconInfo>
}

/**
 * Animates icon
 * [views] Array<out ViewWithIcons> views with animated icons
 */
internal class IconAnimator(private val interval: Int, private vararg val views: ViewWithIcons) : Disposable {
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.SWING_THREAD, this)

    fun start() {
        assert(SwingUtilities.isEventDispatchThread())
        alarm.addRequest(this::updateIcons, interval)
    }

    private fun updateIcons() {
        // Update only animated icons
        views.flatMap { it.getIconsAndUpdaters() }.filter { it.icon is AnimatedIcon }.forEach { it.update() }

        if (!alarm.isDisposed) {
            start()
        }
    }

    override fun dispose() {
    }
}
