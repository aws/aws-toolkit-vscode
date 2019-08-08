// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.components.telemetry

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.actionSystem.ex.ComboBoxAction
import software.aws.toolkits.core.telemetry.TelemetryNamespace
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import javax.swing.Icon

object ToolkitActionPlaces {
    val EXPLORER_WINDOW = "ExplorerToolWindow"
}

// Constructor signatures:
//  public AnAction(){
//  }
//  public AnAction(Icon icon){
//    this(null, null, icon);
//  }
//  public AnAction(@Nullable String text) {
//    this(text, null, null);
//  }
//  public AnAction(@Nullable String text, @Nullable String description, @Nullable Icon icon) {
//    <logic>
//  }
abstract class AnActionWrapper(text: String? = null, description: String? = null, icon: Icon? = null) :
    TelemetryNamespace,
    AnAction(text, description, icon) {

    /**
     * Consumers should use doActionPerformed(e: AnActionEvent)
     */
    final override fun actionPerformed(e: AnActionEvent) {
        doActionPerformed(e)
        TelemetryService.getInstance().record(e.project, getNamespace()) {
            datum(e.place) {
                count()
            }
        }
    }

    abstract fun doActionPerformed(e: AnActionEvent)
}

abstract class ComboBoxActionWrapper : TelemetryNamespace, ComboBoxAction() {
    /**
     * Consumers should use doActionPerformed(e: AnActionEvent)
     */
    final override fun actionPerformed(e: AnActionEvent) {
        doActionPerformed(e)
        TelemetryService.getInstance().record(e.project, getNamespace()) {
            datum(e.place) {
                count()
            }
        }
    }

    open fun doActionPerformed(e: AnActionEvent) = super.actionPerformed(e)
}

abstract class ToogleActionWrapper(text: String? = null, description: String? = null, icon: Icon? = null) :
    TelemetryNamespace,
    ToggleAction(text, description, icon) {

    init {
        // Disable mnemonic check to avoid filtering '_'
        this.templatePresentation.setText(text, false)
    }

    // this will be repeatedly called by the IDE, so we likely do not want telemetry on this,
    // but keeping this to maintain API consistency
    final override fun isSelected(e: AnActionEvent): Boolean = doIsSelected(e)

    final override fun setSelected(e: AnActionEvent, state: Boolean) {
        doSetSelected(e, state)
        TelemetryService.getInstance().record(e.project, getNamespace()) {
            datum(e.place) {
                count()
            }
        }
    }

    abstract fun doIsSelected(e: AnActionEvent): Boolean

    abstract fun doSetSelected(e: AnActionEvent, state: Boolean)
}