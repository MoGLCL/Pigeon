import{describe,expect,it}from"vitest";import{settingsTabsForRole}from"@/lib/settings-tabs";
describe("settings role visibility",()=>{it.each(["user","admin","moderator","owner"])("keeps integration setup out of %s account settings",role=>{expect(settingsTabsForRole(role)).toEqual(["profile","security"])})});
