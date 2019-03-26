// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.util.SystemInfo
import com.intellij.psi.PsiClass
import com.intellij.util.io.isDirectory
import com.intellij.util.io.readBytes
import com.intellij.util.io.write
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

internal fun HeavyJavaCodeInsightTestFixtureRule.setUpGradleProject(): PsiClass {
    val fixture = this.fixture
    fixture.addFileToModule(
        this.module,
        "build.gradle",
        """
            plugins {
                id 'java'
            }

            repositories {
                mavenCentral()
            }

            dependencies {
                compile 'com.amazonaws:aws-lambda-java-core:1.2.0'
                testCompile 'junit:junit:4.12'
            }
            """.trimIndent()
    )

    // Use our project's own Gradle version
    copyGradleFiles(this)

    return fixture.addClass(
        """
            package com.example;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """.trimIndent()
    )
}

private fun copyGradleFiles(fixtureRule: HeavyJavaCodeInsightTestFixtureRule) {
    val gradleRoot = findGradlew()
    val gradleFiles = setOf("gradle/", "gradlew.bat", "gradlew")

    gradleFiles.forEach {
        val gradleFile = gradleRoot.resolve(it)
        if (gradleFile.exists()) {
            copyPath(fixtureRule, gradleRoot, gradleFile)
        } else {
            throw IllegalStateException("Failed to locate $it")
        }
    }
}

private fun copyPath(fixtureRule: HeavyJavaCodeInsightTestFixtureRule, root: Path, path: Path) {
    if (path.isDirectory()) {
        Files.list(path).forEach {
            // Skip over files like .DS_Store. No gradlew related files start with a "." so safe to skip
            if (it.fileName.toString().startsWith(".")) {
                return@forEach
            }
            copyPath(fixtureRule, root, it)
        }
    } else {
        fixtureRule.fixture.addFileToModule(fixtureRule.module, root.relativize(path).toString(), "").also { newFile ->
            val newPath = Paths.get(newFile.virtualFile.path)
            newPath.write(path.readBytes())
            if (SystemInfo.isUnix) {
                Files.setPosixFilePermissions(newPath, Files.getPosixFilePermissions(path))
            }
        }
    }
}

private fun findGradlew(): Path {
    var root = Paths.get("").toAbsolutePath()
    while (root.parent != null) {
        if (root.resolve("gradlew").exists()) {
            return root
        } else {
            root = root.parent
        }
    }

    throw IllegalStateException("Failed to locate gradlew")
}

internal fun HeavyJavaCodeInsightTestFixtureRule.setUpMavenProject(): PsiClass {
    val fixture = this.fixture
    fixture.addFileToModule(
        this.module,
        "pom.xml",
        """
            <project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/maven-v4_0_0.xsd">
                <modelVersion>4.0.0</modelVersion>
                <groupId>helloworld</groupId>
                <artifactId>HelloWorld</artifactId>
                <version>1.0</version>
                <packaging>jar</packaging>
                <name>A sample Hello World created for SAM CLI.</name>
                <properties>
                    <maven.compiler.source>1.8</maven.compiler.source>
                    <maven.compiler.target>1.8</maven.compiler.target>
                </properties>

                <dependencies>
                    <dependency>
                        <groupId>com.amazonaws</groupId>
                        <artifactId>aws-lambda-java-core</artifactId>
                        <version>1.2.0</version>
                    </dependency>
                    <dependency>
                      <groupId>junit</groupId>
                      <artifactId>junit</artifactId>
                      <version>4.12</version>
                      <scope>test</scope>
                    </dependency>
                </dependencies>
            </project>
            """.trimIndent()
    )

    return fixture.addClass(
        """
            package com.example;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """.trimIndent()
    )
}