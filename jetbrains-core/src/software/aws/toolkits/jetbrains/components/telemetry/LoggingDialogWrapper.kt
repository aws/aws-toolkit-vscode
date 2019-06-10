// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.components.telemetry

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import software.aws.toolkits.core.telemetry.TelemetryNamespace
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import java.awt.Component

// DialogWrapper constructor signatures:
//  protected DialogWrapper(@Nullable Project project, boolean canBeParent)
//    this(project, canBeParent, IdeModalityType.IDE);
//  }
//  protected DialogWrapper(@Nullable Project project, boolean canBeParent, @NotNull IdeModalityType ideModalityType)
//    this(project, null, canBeParent, ideModalityType);
//  }
//  protected DialogWrapper(@Nullable Project project, @Nullable Component parentComponent, boolean canBeParent, @NotNull IdeModalityType ideModalityType) {
//    <logic>
//  }
//  protected DialogWrapper(@Nullable Project project) {
//    this(project, true);
//  }
//  protected DialogWrapper(boolean canBeParent) {
//    this((Project)null, canBeParent);
//  }
//  @Deprecated
//  protected DialogWrapper(boolean canBeParent, boolean applicationModalIfPossible)
//    this(null, canBeParent, applicationModalIfPossible);
//  }
//  protected DialogWrapper(Project project, boolean canBeParent, boolean applicationModalIfPossible) {
//    <logic>
//  }
//  protected DialogWrapper(@NotNull Component parent, boolean canBeParent) {
//    <logic>
//  }

abstract class LoggingDialogWrapper : DialogWrapper, TelemetryNamespace {
    private val myProject: Project

    constructor(
        project: Project,
        component: Component? = null,
        canBeParent: Boolean = true,
        ideModalityType: IdeModalityType = IdeModalityType.IDE
    ) : super(project, component, canBeParent, ideModalityType) {
        this.myProject = project
    }

    constructor(project: Project, parent: Component, canBeParent: Boolean) : super(parent, canBeParent) {
        this.myProject = project
    }

    override fun doOKAction() {
        super.doOKAction()

        TelemetryService.getInstance().record(myProject, getNamespace()) {
            datum("OKAction") {
                count()
            }
        }
    }

    override fun doCancelAction() {
        super.doCancelAction()

        TelemetryService.getInstance().record(myProject, getNamespace()) {
            datum("CancelAction") {
                count()
            }
        }
    }
}