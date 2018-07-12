import * as assert from 'assert';
import { AWSContext } from '../shared/awsContext';
import { ISettingsConfiguration } from '../shared/settingsConfiguration';
import { ConfigurationTarget } from 'vscode';
import { regionSettingKey, profileSettingKey } from '../shared/constants';

suite("AWSContext Tests", function (): void {

    const testRegionValue: string = 'some-region-somewhere';
    const testProfileValue: string = 'some-credential-profile';

    class ContextTestsSettingsConfigurationBase implements ISettingsConfiguration {
        readSetting(settingKey: string, defaultValue?: string | undefined): string | undefined {
            return undefined;
        }

        writeSetting(settingKey: string, value: string, target: ConfigurationTarget): void {
        }
    }


    test('context reads and sets profile from config on startup', function() {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            readSetting(settingKey: string, defaultValue?: string | undefined): string | undefined {
                if(settingKey === profileSettingKey) {
                    return testProfileValue;
                }

                return super.readSetting(settingKey, defaultValue);
            }

        }

        const testContext = new AWSContext(new TestConfiguration());
        assert.equal(testContext.getCredentialProfileName(), testProfileValue);
    });

    test('context reads and sets region from config on startup', async function() {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            readSetting(settingKey: string, defaultValue?: string | undefined): string | undefined {
                if(settingKey === regionSettingKey) {
                    return testRegionValue;
                }

                return super.readSetting(settingKey, defaultValue);
            }
        }


        const testContext = new AWSContext(new TestConfiguration());
        assert.equal(await testContext.getRegion(), testRegionValue);
    });

    test('context updates config on change region', function() {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            writeSetting(settingKey: string, value: string, target: ConfigurationTarget): void {
                assert.equal(settingKey, regionSettingKey);
                assert.equal(value, testRegionValue);
                assert.equal(target, ConfigurationTarget.Global);
            }
        }


        const testContext = new AWSContext(new TestConfiguration());
        testContext.setRegion(testRegionValue);
    });

    test('context updates config on change profile', function() {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            writeSetting(settingKey: string, value: string, target: ConfigurationTarget): void {
                assert.equal(settingKey, profileSettingKey);
                assert.equal(value, testProfileValue);
                assert.equal(target, ConfigurationTarget.Global);
            }
        }


        const testContext = new AWSContext(new TestConfiguration());
        testContext.setRegion(testRegionValue);
    });

    /* disabled until I can figure out how to test events
    test('context fires event on region change', async function(done) {

        const testContext = new AWSContext(new ContextTestsSettingsConfigurationBase());

        testContext.onDidChangeContext((c) => {
            assert.equal(c.region, testRegionValue);
        });

        await testContext.setRegion(testRegionValue);
    });
    */
});
