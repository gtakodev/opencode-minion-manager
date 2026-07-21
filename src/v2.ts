import { define } from "@opencode-ai/plugin/v2/promise";

export const MinionManagerV2 = define({
  id: "opencode.minion-manager",
  async setup(context) {
    await context.agent.transform((draft) => {
      const manager = draft.get("Manager");
      if (manager) {
        draft.update("Manager", (agent) => {
          agent.mode = "primary";
          agent.hidden = false;
          agent.permissions = [
            { action: "edit", resource: "*", effect: "deny" },
            { action: "bash", resource: "*", effect: "deny" },
            { action: "task", resource: "*", effect: "deny" },
            { action: "minion_delegate", resource: "*", effect: "allow" },
          ];
        });
      }
    });
  },
});

export default MinionManagerV2;
