// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererLicenseInfoManager
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message

class CodeWhispererLicenseInfoManagerTest : CodeWhispererTestBase() {
    private val mapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    private val licenseLinks by lazy {
        runUnderProgressIfNeeded(null, message("codewhisperer.loading_licenses"), cancelable = false) {
            this.javaClass.getResourceAsStream("/codewhisperer/licenses.json")?.use { resourceStream ->
                mapper.readValue<Map<String, String>>(resourceStream)
            } ?: throw RuntimeException("CodeWhisperer license info not found")
        }
    }

    @Test
    fun `test service return correct license links for licenses in the file licenses json`() {
        val manager = CodeWhispererLicenseInfoManager.getInstance()
        licenseLinks.forEach { (k, v) ->
            assertThat(manager.getLicenseLink(k)).isEqualTo(v)
        }
    }
}
