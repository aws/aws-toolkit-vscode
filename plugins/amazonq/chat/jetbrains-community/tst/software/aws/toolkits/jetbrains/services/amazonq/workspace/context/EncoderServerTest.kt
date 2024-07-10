// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.workspace.context

import com.intellij.util.io.DigestUtil
import org.apache.commons.codec.digest.DigestUtils
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.cwc.editor.context.project.EncoderServer
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import java.math.BigInteger

class EncoderServerTest {
    @Rule @JvmField
    val projectRule: CodeInsightTestFixtureRule = JavaCodeInsightTestFixtureRule()
    private lateinit var encoderServer: EncoderServer
    private val inputBytes = BigInteger(32, DigestUtil.random).toByteArray()

    @Before
    open fun setup() {
        encoderServer = EncoderServer(projectRule.project)
    }

    @Test
    fun `test download artifacts validate hash if it does not match`() {
        val wrongHash = "sha384:ad527e9583d3dc4be3d302bac17f8d5a64eb8f5ab536717982620232e4e4bad82d1041fb73ae27899e9e802f07f61567"

        val actual = encoderServer.validateHash(wrongHash, inputBytes)
        assertThat(actual).isEqualTo(false)
    }

    @Test
    fun `test download artifacts validate hash if it matches`() {
        val rightHash = "sha384:${DigestUtils.sha384Hex(inputBytes)}"

        val actual = encoderServer.validateHash(rightHash, inputBytes)
        assertThat(actual).isEqualTo(true)
    }
}
