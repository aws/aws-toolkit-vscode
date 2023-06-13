// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.editor.markup.EffectType
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.ui.JBColor
import software.amazon.awssdk.regions.Region
import java.awt.Font
import java.text.SimpleDateFormat
import java.time.format.DateTimeFormatter

object CodeWhispererConstants {
    const val CHARACTERS_LIMIT = 10240
    const val BEGINNING_OF_FILE = 0
    const val FILENAME_CHARS_LIMIT = 1024
    const val INVOCATION_KEY_INTERVAL_THRESHOLD = 15
    val SPECIAL_CHARACTERS_LIST = listOf("{", "[", "(", ":")
    val PAIRED_BRACKETS = mapOf('{' to '}', '(' to ')', '[' to ']', '<' to '>')
    val PAIRED_QUOTES = setOf('"', '\'', '`')
    const val INVOCATION_TIME_INTERVAL_THRESHOLD = 2
    const val LEFT_CONTEXT_ON_CURRENT_LINE = 50
    const val POPUP_INFO_TEXT_SIZE = 11f
    const val POPUP_BUTTON_TEXT_SIZE = 12f
    const val POPUP_DELAY: Long = 250
    const val POPUP_DELAY_CHECK_INTERVAL: Long = 25
    const val IDLE_TIME_CHECK_INTERVAL: Long = 25
    const val SUPPLEMENTAL_CONTEXT_TIMEOUT = 50L

    // TODO: this is currently set to 2050 to account for the server side 0.5 TPS and and extra 50 ms buffer to
    // avoid ThrottlingException as much as possible.
    const val INVOCATION_INTERVAL: Long = 2050

    const val CODEWHISPERER_LEARN_MORE_URI = "https://aws.amazon.com/codewhisperer"
    const val CODEWHISPERER_SSO_LEARN_MORE_URI = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/codewhisperer-auth.html"
    const val CODEWHISPERER_LOGIN_LEARN_MORE_URI = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/codewhisper-setup-general.html"
    const val CODEWHISPERER_LOGIN_HELP_URI = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html"

    const val THROTTLING_MESSAGE = "Maximum recommendation count reached for this month."

    // Code scan feature constants
    val ISSUE_HIGHLIGHT_TEXT_ATTRIBUTES = TextAttributes(null, null, JBColor.YELLOW, EffectType.WAVE_UNDERSCORE, Font.PLAIN)
    const val JAVA_CODE_SCAN_TIMEOUT_IN_SECONDS: Long = 60
    const val JAVA_PAYLOAD_LIMIT_IN_BYTES = 1024 * 1024 // 1MB
    const val PYTHON_CODE_SCAN_TIMEOUT_IN_SECONDS: Long = 60
    const val PYTHON_PAYLOAD_LIMIT_IN_BYTES = 1024 * 200 // 200KB
    const val JS_CODE_SCAN_TIMEOUT_IN_SECONDS: Long = 60
    const val JS_PAYLOAD_LIMIT_IN_BYTES = 1024 * 200 // 200KB
    const val CODE_SCAN_POLLING_INTERVAL_IN_SECONDS: Long = 5
    const val CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS: Long = 10
    const val TOTAL_BYTES_IN_KB = 1024
    const val TOTAL_BYTES_IN_MB = 1024 * 1024
    const val TOTAL_MILLIS_IN_SECOND = 1000
    const val TOTAL_SECONDS_IN_MINUTE: Long = 60L
    const val ACCOUNTLESS_START_URL = "accountless"

    // Date when Accountless is not supported
    val EXPIRE_DATE = SimpleDateFormat("yyyy-MM-dd").parse("2023-01-31")

    // Formatter for timestamp on accountless warn notification
    val TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    object AutoSuggestion {
        const val SETTING_ID = "codewhisperer_autoSuggestionActivation"
        const val ACTIVATED = "Activated"
        const val DEACTIVATED = "Deactivated"
    }

    object Config {
        const val CODEWHISPERER_ENDPOINT = "https://codewhisperer.us-east-1.amazonaws.com/"

        const val CODEWHISPERER_IDPOOL_ID = "us-east-1:70717e99-906f-4add-908c-bd9074a2f5b9"

        val Sigv4ClientRegion = Region.US_EAST_1
        val BearerClientRegion = Region.US_EAST_1
    }
}
