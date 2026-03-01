import { Component, Show, createMemo } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneral } from "./settings-general"
import { SettingsKeybinds } from "./settings-keybinds"
import { SettingsProviders } from "./settings-providers"
import { SettingsModels } from "./settings-models"

export const DialogSettings: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const compact = createMediaQuery("(max-width: 767px)")
  const orientation = createMemo(() => (compact() ? "horizontal" : "vertical"))
  const variant = createMemo(() => (compact() ? "pill" : "settings"))

  return (
    <Dialog size="x-large" transition>
      <Tabs orientation={orientation()} variant={variant()} defaultValue="general" class="h-full settings-dialog">
        <Tabs.List>
          <Show
            when={compact()}
            fallback={
              <div class="flex flex-col justify-between h-full w-full">
                <div class="flex flex-col gap-3 w-full pt-3">
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1.5">
                      <Tabs.SectionTitle>{language.t("settings.section.desktop")}</Tabs.SectionTitle>
                      <div class="flex flex-col gap-1.5 w-full">
                        <Tabs.Trigger value="general">
                          <Icon name="sliders" />
                          {language.t("settings.tab.general")}
                        </Tabs.Trigger>
                        <Tabs.Trigger value="shortcuts">
                          <Icon name="keyboard" />
                          {language.t("settings.tab.shortcuts")}
                        </Tabs.Trigger>
                      </div>
                    </div>

                    <div class="flex flex-col gap-1.5">
                      <Tabs.SectionTitle>{language.t("settings.section.server")}</Tabs.SectionTitle>
                      <div class="flex flex-col gap-1.5 w-full">
                        <Tabs.Trigger value="providers">
                          <Icon name="providers" />
                          {language.t("settings.providers.title")}
                        </Tabs.Trigger>
                        <Tabs.Trigger value="models">
                          <Icon name="models" />
                          {language.t("settings.models.title")}
                        </Tabs.Trigger>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col gap-1 pl-1 py-1 text-12-medium text-text-weak">
                  <span>{language.t("app.name.desktop")}</span>
                  <span class="text-11-regular">v{platform.version}</span>
                </div>
              </div>
            }
          >
            <div class="w-full flex items-center gap-1 px-2 py-2 overflow-x-auto no-scrollbar">
              <Tabs.Trigger value="general">
                <Icon name="sliders" />
                {language.t("settings.tab.general")}
              </Tabs.Trigger>
              <Tabs.Trigger value="shortcuts">
                <Icon name="keyboard" />
                {language.t("settings.tab.shortcuts")}
              </Tabs.Trigger>
              <Tabs.Trigger value="providers">
                <Icon name="providers" />
                {language.t("settings.providers.title")}
              </Tabs.Trigger>
              <Tabs.Trigger value="models">
                <Icon name="models" />
                {language.t("settings.models.title")}
              </Tabs.Trigger>
            </div>
          </Show>
        </Tabs.List>
        <Tabs.Content value="general" class="no-scrollbar">
          <SettingsGeneral />
        </Tabs.Content>
        <Tabs.Content value="shortcuts" class="no-scrollbar">
          <SettingsKeybinds />
        </Tabs.Content>
        <Tabs.Content value="providers" class="no-scrollbar">
          <SettingsProviders />
        </Tabs.Content>
        <Tabs.Content value="models" class="no-scrollbar">
          <SettingsModels />
        </Tabs.Content>
      </Tabs>
    </Dialog>
  )
}
