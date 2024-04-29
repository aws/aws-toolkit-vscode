// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.project.Project
import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType

typealias CodeWhispererExplorerActionManager = migration.software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager

class CodeWhispererExploreActionState : BaseState() {
    @get:Property
    val value by map<CodeWhispererExploreStateType, Boolean>()

    // can not remove this as we want to support existing accountless users
    @get:Property
    var token by string()

    @get:Property
    var accountlessWarnTimestamp by string()

    @get:Property
    var accountlessErrorTimestamp by string()
}

// TODO: Don't remove IsManualEnabled
enum class CodeWhispererExploreStateType {
    IsAutoEnabled,
    IsAutoCodeScanEnabled,
    IsMonthlyQuotaForCodeScansExceeded,
    IsManualEnabled,
    IsFirstRestartAfterQInstall,
    HasAcceptedTermsOfServices,
    HasShownHowToUseCodeWhisperer,
    HasShownNewOnboardingPage,
    DoNotShowAgainWarn,
    DoNotShowAgainError,
    AccountlessNullified,
    ConnectionExpiredDoNotShowAgain
}

interface CodeWhispererActivationChangedListener {
    fun activationChanged(value: Boolean) {}
}

@Deprecated("remove it, use isQConnected")
fun isCodeWhispererEnabled(project: Project) = with(CodeWhispererExplorerActionManager.getInstance()) {
    checkActiveCodeWhispererConnectionType(project) != CodeWhispererLoginType.Logout
}

fun isUserBuilderId(project: Project) = with(CodeWhispererExplorerActionManager.getInstance()) {
    checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.Sono
}

/**
 * Note: please use this util with extra caution, it will return "false" for a "logout" scenario,
 *  the reasoning is we need handling specifically for a "Expired" condition thus excluding logout from here
 *  If callers rather need a predicate "isInvalidConnection", please use the combination of the two (!isCodeWhispererEnabled() || isCodeWhispererExpired())
 */
@Deprecated("remove it, use isQExpired")
fun isCodeWhispererExpired(project: Project) = with(CodeWhispererExplorerActionManager.getInstance()) {
    checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.Expired
}
