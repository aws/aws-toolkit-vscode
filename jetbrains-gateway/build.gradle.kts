// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.intellij.IdeFlavor

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-detekt")
    id("toolkit-testing")
    id("toolkit-integration-testing")
    id("toolkit-intellij-subplugin")
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.GW)
}

dependencies {
    implementation(project(":jetbrains-core"))

    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    testImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
    testImplementation(libs.wiremock)
    testImplementation(libs.sshd.core)
    testImplementation(libs.sshd.scp)

    attributesSchema {
        attribute(LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE) {
            compatibilityRules.add(GatewayJarRule::class.java)
        }
    }
}

configurations {
    all {
        // definitely won't be used in Gateway
        setOf(
            libs.aws.apprunner,
            libs.aws.cloudformation,
            libs.aws.cloudcontrol,
            libs.aws.cloudwatchlogs,
            libs.aws.dynamodb,
            libs.aws.ec2,
            libs.aws.ecr,
            libs.aws.ecs,
            libs.aws.lambda,
            libs.aws.rds,
            libs.aws.redshift,
            libs.aws.secretsmanager,
            libs.aws.schemas,
            libs.aws.sns,
            libs.aws.sqs,
        ).forEach {
            val dep = it.get().module
            exclude(group = dep.group, module = dep.name)
        }
    }

    runtimeClasspath {
        attributes {
            attribute(LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE, objects.named("gateway-instrumented-jar"))
        }
    }
}

abstract class GatewayJarRule : AttributeCompatibilityRule<LibraryElements> {
    override fun execute(details: CompatibilityCheckDetails<LibraryElements>) {
        // needed to make transitive dependencies resolve correctly
        if (details.consumerValue?.name == "gateway-instrumented-jar" && details.producerValue?.name == "jar") {
            details.compatible()
        }
    }
}

val gatewayResources = configurations.create("gatewayResources") {
    isCanBeResolved = false
}

val toolkitInstallationScripts = tasks.register<Tar>("generateTar") {
    archiveFileName.set("scripts.tar.gz")
    compression = Compression.GZIP
    from("gateway-resources/remote")
    // set all files as:
    //           r-xr-xr-x
    fileMode = 0b101101101
}

val gatewayResourcesDir = tasks.register<Sync>("gatewayResourcesDir") {
    from("gateway-resources/caws-proxy-command.bat", toolkitInstallationScripts)
    into("$buildDir/$name")

    includeEmptyDirs = false
}

artifacts {
    add(gatewayResources.name, gatewayResourcesDir)
}

tasks.prepareSandbox {
    from(gatewayResourcesDir) {
        into("aws-toolkit-jetbrains/gateway-resources")
    }
}

val publishToken: String by project
val publishChannel: String by project
tasks.publishPlugin {
    token.set(publishToken)
    channels.set(publishChannel.split(",").map { it.trim() })
}
