package software.aws.toolkits.jetbrains.testutils.rules

import com.intellij.openapi.project.Project
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.DefaultLightProjectDescriptor
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.fixtures.JavaCodeInsightTestFixture
import com.intellij.testFramework.fixtures.JavaTestFixtureFactory
import com.intellij.testFramework.fixtures.impl.LightTempDirTestFixtureImpl

/**
 * JUnit test Rule that will create a Light [Project] and [JavaCodeInsightTestFixture]. Projects are lazily created
 * and are torn down after each test.
 *
 * If you wish to have just a [Project], you may use Intellij's [com.intellij.testFramework.ProjectRule]
 */
class JavaCodeInsightTestFixtureRule(testDescription: DefaultLightProjectDescriptor = DefaultLightProjectDescriptor()) :
    CodeInsightTestFixtureRule(testDescription) {

    override fun createTestFixture(): CodeInsightTestFixture {
        val fixtureBuilder = IdeaTestFixtureFactory.getFixtureFactory().createLightFixtureBuilder(testDescription)
        val newFixture = JavaTestFixtureFactory.getFixtureFactory()
            .createCodeInsightFixture(fixtureBuilder.fixture, LightTempDirTestFixtureImpl(true));
        newFixture.setUp()
        newFixture.testDataPath = testDataPath
        return newFixture
    }

    override val fixture: JavaCodeInsightTestFixture
        get() = lazyFixture.value as JavaCodeInsightTestFixture
}
