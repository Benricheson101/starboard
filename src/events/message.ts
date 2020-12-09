import { defaultGuildDocument } from "../setup";
import {
  Message,
  PermissionResolvable,
  GuildMember,
  Permissions,
} from "discord.js";
import { GuildDocument } from "../types";
import Command, { getLevel } from "../util/Command";
import Client from "../util/Client";

export = async (client: Client, message: Message): Promise<void | Message> => {
  if (!client.db)
    return await message.channel.send(":x: A database error occurred!");
  if (message.author.bot) return;
  if (message.channel.type !== "text") return;

  let guild: GuildDocument = await message.guild.db;

  if (!guild) {
    guild = defaultGuildDocument(message.guild.id);
    client.db.insert("guilds", guild);
  }

  if (!message.content.startsWith(guild.config.prefix)) return;

  const args: string[] = message.content
    .slice(guild.config.prefix.length)
    .split(" ");
  const command: string = args.shift().toLowerCase();

  const cmd: Command | null =
    client.commands.get(command) ||
    client.commands.find((c: Command) => c.config?.aliases?.includes(command));
  if (!cmd) return;

  if (cmd.config?.level > getLevel(message.member))
    return await message.channel.send(
      "🔒 You do not have permission to use this command."
    );

  const { user, bot } = checkPermissions(cmd, message.member);
  if (user.toArray().length || bot.toArray().length) {
    const m: string[] = [
      ":x: The command could not be preformed because one or more permissions are missing.",
    ];

    if (user.toArray().length)
      m.push(
        "You are missing:",
        ...user.toArray(false).map((p) => `> \`${p as string}\``),
        `**Required**: \`${user.bitfield}\``
      );
    if (bot.toArray().length)
      m.push(
        "I am missing:",
        ...bot.toArray(false).map((p) => `> \`${p as string}\``),
        `**Required**: \`${bot.bitfield}\``
      );

    return message.channel.send(m.join("\n"));
  }

  if (cmd.config.disabled && !client.admins.has(message.author.id))
    return await message.channel.send("🔒 This command has been disabled.");

  if (
    client.options?.startupCooldown > client.uptime &&
    !client.admins.has(message.author.id)
  )
    return await message.channel.send(
      "🕐 I am still starting up, please try again in a few seconds"
    );

  try {
    cmd.run(client, message, args, guild);
  } catch (err) {
    console.error(err);
    message.channel.send(client.constants.errors.generic);
  }
};

/**
 * Get missing permissions for the bot and the user
 * @param {Command} command The command to check for
 * @param {GuildMember} user The user to check permissions for
 */
function checkPermissions(
  { config: { permissions } }: Command,
  {
    guild: {
      me: { permissions: botPerms },
    },
    permissions: userPerms,
  }: GuildMember
): { user: Permissions; bot: Permissions } {
  const bot: PermissionResolvable = new Permissions(permissions?.bot ?? 0);
  const user: PermissionResolvable = new Permissions(permissions?.user ?? 0);

  const missing = {
    user: new Permissions(),
    bot: new Permissions(),
  };

  if (!userPerms.has(user))
    missing.user = new Permissions(userPerms.missing(user));
  if (!botPerms.has(bot)) missing.bot = new Permissions(botPerms.missing(bot));

  return missing;
}
