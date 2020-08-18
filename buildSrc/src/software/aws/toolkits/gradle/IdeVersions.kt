// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.gradle.api.Project

enum class ProductCode {
    IC,
    IU,
    RD
}

open class ProductProfile(
    val sdkVersion: String,
    val plugins: List<String>
)

class RiderProfile(
    sdkVersion: String,
    plugins: List<String>,
    val rdGenVersion: String,
    val nugetVersion: String
) : ProductProfile(sdkVersion, plugins)

data class Profile(
    val sinceVersion: String,
    val untilVersion: String,
    val products: Map<ProductCode, ProductProfile>
)

class IdeVersions(private val project: Project) {
    private val ideProfiles = mapOf(
        "2019.3" to Profile(
            sinceVersion = "193",
            untilVersion = "193.*",
            products = mapOf(
                ProductCode.IC to ProductProfile(
                    sdkVersion = "IC-2019.3",
                    plugins = listOf(
                        "org.jetbrains.plugins.terminal",
                        "org.jetbrains.plugins.yaml",
                        "PythonCore:193.5233.139",
                        "java",
                        "com.intellij.gradle",
                        "org.jetbrains.idea.maven",
                        "Docker:193.5233.140"
                    )
                ),
                ProductCode.IU to ProductProfile(
                    sdkVersion = "IU-2019.3",
                    plugins = listOf(
                        "org.jetbrains.plugins.terminal",
                        "Pythonid:193.5233.109",
                        "org.jetbrains.plugins.yaml",
                        "JavaScript",
                        "JavaScriptDebugger"
                    )
                ),
                ProductCode.RD to RiderProfile(
                    sdkVersion = "RD-2019.3.4",
                    rdGenVersion = "0.193.146",
                    nugetVersion = "2019.3.4",
                    plugins = listOf(
                        "org.jetbrains.plugins.yaml"
                    )
                )
            )
        ),
        "2020.1" to Profile(
            sinceVersion = "201",
            untilVersion = "201.*",
            products = mapOf(
                ProductCode.IC to ProductProfile(
                    sdkVersion = "IC-2020.1",
                    plugins = listOf(
                        "org.jetbrains.plugins.terminal",
                        "org.jetbrains.plugins.yaml",
                        "PythonCore:201.6668.31",
                        "java",
                        "com.intellij.gradle",
                        "org.jetbrains.idea.maven",
                        "Docker:201.6668.30"
                    )
                ),
                ProductCode.IU to ProductProfile(
                    sdkVersion = "IU-2020.1",
                    plugins = listOf(
                        "org.jetbrains.plugins.terminal",
                        "Pythonid:201.6668.31",
                        "org.jetbrains.plugins.yaml",
                        "JavaScript",
                        "JavaScriptDebugger",
                        "com.intellij.database"
                    )
                ),
                ProductCode.RD to RiderProfile(
                    sdkVersion = "RD-2020.1.0",
                    rdGenVersion = "0.201.69",
                    nugetVersion = "2020.1.0",
                    plugins = listOf(
                        "org.jetbrains.plugins.yaml"
                    )
                )
            )
        ),
        "2020.2" to Profile(
            sinceVersion = "202",
            untilVersion = "202.*",
            products = mapOf(
                ProductCode.IC to ProductProfile(
                    sdkVersion = "IC-2020.2",
                    plugins = listOf(
                        "org.jetbrains.plugins.terminal",
                        "org.jetbrains.plugins.yaml",
                        "PythonCore:202.6397.124",
                        "java",
                        "com.intellij.gradle",
                        "org.jetbrains.idea.maven",
                        "Docker:202.6397.93"
                    )
                ),
                ProductCode.IU to ProductProfile(
                    sdkVersion = "IU-2020.2",
                    plugins = listOf(
                        "org.jetbrains.plugins.terminal",
                        "Pythonid:202.6397.98",
                        "org.jetbrains.plugins.yaml",
                        "JavaScript",
                        "JavaScriptDebugger",
                        "com.intellij.database"
                    )
                ),
                ProductCode.RD to RiderProfile(
                    sdkVersion = "RD-2020.2",
                    rdGenVersion = "0.202.113",
                    nugetVersion = "2020.2.0",
                    plugins = listOf(
                        "org.jetbrains.plugins.yaml"
                    )
                )
            )
        )
    )

    fun sinceVersion(): String = getProfile().sinceVersion
    fun untilVersion() = getProfile().untilVersion

    fun sdkVersion(code: ProductCode): String = getProductProfile(code).sdkVersion
    fun plugins(code: ProductCode): List<String> = getProductProfile(code).plugins

    fun rdGenVersion(): String = getRiderProfile().rdGenVersion
    fun nugetSdkVersion(): String = getRiderProfile().nugetVersion

    // Convert (as an example) 2020.2 -> 202
    fun resolveShortenedIdeProfileName(): String {
        val profileName = resolveIdeProfileName().trim()
        val parts = profileName.split(".")
        return parts[0].substring(2) + parts[1]
    }

    fun ideSdkVersion(code: ProductCode): String = ideProfiles[resolveIdeProfileName()]
        ?.products
        ?.get(code)
        ?.sdkVersion
        ?: throw IllegalArgumentException("Product not in map of IDE versions: ${resolveIdeProfileName()}, $code")

    fun resolveIdeProfileName(): String = if (System.getenv()["ALTERNATIVE_IDE_PROFILE_NAME"] != null) {
        System.getenv("ALTERNATIVE_IDE_PROFILE_NAME")
    } else {
        project.properties["ideProfileName"]?.toString() ?: throw IllegalStateException("No ideProfileName property set")
    }

    private fun getProfile(): Profile =
        ideProfiles[resolveIdeProfileName()] ?: throw IllegalStateException("Unable to resolve profile ${resolveIdeProfileName()}")

    private fun getProductProfile(code: ProductCode): ProductProfile =
        ideProfiles[resolveIdeProfileName()]?.products?.get(code)
            ?: throw IllegalStateException("Unable to get profile ${resolveIdeProfileName()} code $code")

    private fun getRiderProfile(): RiderProfile = ideProfiles[resolveIdeProfileName()]?.products?.get(ProductCode.RD) as? RiderProfile
        ?: throw IllegalStateException("Failed to get Rider profile for ${resolveIdeProfileName()}!")
}
