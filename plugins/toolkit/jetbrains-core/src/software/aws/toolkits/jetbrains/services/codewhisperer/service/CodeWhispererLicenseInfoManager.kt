// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.components.service
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message

class CodeWhispererLicenseInfoManager {
    private val licenseLinks by lazy {
        runUnderProgressIfNeeded(null, message("codewhisperer.loading_licenses"), cancelable = false) {
            this.javaClass.getResourceAsStream("/codewhisperer/licenses.json")?.use { resourceStream ->
                MAPPER.readValue<Map<String, String>>(resourceStream)
            } ?: throw RuntimeException("CodeWhisperer license info not found")
        }
    }

    fun getLicenseLink(code: String) = licenseLinks.getOrDefault(code, "https://spdx.org/licenses")

    companion object {
        fun getInstance(): CodeWhispererLicenseInfoManager = service()
        private val MAPPER = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    }
}
