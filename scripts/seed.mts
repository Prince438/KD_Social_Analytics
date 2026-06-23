/**
 * Seeds demo data for local viewing. Run: npm run db:seed
 * Clears existing workspaces (cascade) and inserts manual accounts with posts,
 * daily metric snapshots, and a follower trend across two workspaces.
 */
import { db } from "../src/lib/db/index.ts";
import {
  workspaces,
  linkedAccounts,
  posts,
  metricsDaily,
  accountMetricsDaily,
} from "../src/lib/db/schema.ts";

type Plat = "youtube" | "instagram" | "tiktok" | "facebook";

const dayStr = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};
const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));

const CAPTIONS: Record<Plat, string[]> = {
  youtube: [
    "How I edit videos in 10 minutes",
    "My honest camera gear review",
    "A day in the life: creator edition",
    "5 mistakes new YouTubers make",
    "I tried the viral productivity method",
    "Behind the scenes of my studio setup",
  ],
  instagram: [
    "Sunset carousel from the weekend ☀️",
    "New reel: 3 quick recipes",
    "BTS of today's shoot",
    "Q&A — you asked, I answered",
    "Throwback to last summer",
    "Outfit of the day 🧥",
  ],
  tiktok: [
    "POV: it's finally friday",
    "Trying the new transition trend",
    "Reply to @user great question!",
    "Day 1 of learning to dance",
    "This sound is stuck in my head",
    "Storytime: the airport chaos",
  ],
  facebook: [
    "Big announcement for our community",
    "Photo album: launch event",
    "Weekly tips roundup",
    "We hit a milestone — thank you!",
    "Live recap from yesterday",
    "Customer spotlight of the week",
  ],
};

async function makeAccount(
  workspaceId: string,
  platform: Plat,
  name: string,
  baseFollowers: number,
) {
  const [acct] = await db
    .insert(linkedAccounts)
    .values({
      workspaceId,
      platform,
      source: "manual",
      platformAccountId: `manual:${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      displayName: name,
      lastSyncedAt: new Date(),
    })
    .returning({ id: linkedAccounts.id });

  // Posts + a "today" metric snapshot each.
  const captions = CAPTIONS[platform];
  for (let i = 0; i < captions.length; i++) {
    const views = rand(2000, 90000);
    const likes = Math.floor(views * (rand(3, 9) / 100));
    const comments = Math.floor(likes * (rand(2, 12) / 100));
    const shares = Math.floor(likes * (rand(1, 6) / 100));
    const [post] = await db
      .insert(posts)
      .values({
        linkedAccountId: acct.id,
        platformPostId: `${platform}-${i}`,
        type: platform === "youtube" ? "video" : "post",
        caption: captions[i],
        url: "https://example.com/post",
        // Recent so every dashboard range (7/30/90d) is well populated.
        publishedAt: new Date(Date.now() - rand(0, 13) * 86400000),
      })
      .returning({ id: posts.id });

    await db.insert(metricsDaily).values({
      postId: post.id,
      date: dayStr(0),
      views,
      likes,
      comments,
      shares,
      impressions: Math.floor(views * 1.4),
      reach: Math.floor(views * 1.1),
      engagementRate: (likes + comments + shares) / views,
    });
  }

  // 14-day follower trend with gentle growth.
  let followers = baseFollowers;
  for (let d = 14; d >= 0; d--) {
    followers += rand(20, 400);
    await db.insert(accountMetricsDaily).values({
      linkedAccountId: acct.id,
      date: dayStr(d),
      followers,
      views: rand(1000, 30000),
    });
  }
}

async function main() {
  console.log("Clearing existing data…");
  await db.delete(workspaces); // cascades to everything

  const [def] = await db
    .insert(workspaces)
    .values({ name: "Default" })
    .returning({ id: workspaces.id });
  const [acme] = await db
    .insert(workspaces)
    .values({ name: "Client: Acme" })
    .returning({ id: workspaces.id });

  console.log("Seeding Default workspace…");
  await makeAccount(def.id, "youtube", "My YouTube Channel", 12000);
  await makeAccount(def.id, "instagram", "@mybrand", 8500);
  await makeAccount(def.id, "tiktok", "@mybrand", 30000);

  console.log("Seeding Client: Acme workspace…");
  await makeAccount(acme.id, "facebook", "Acme Inc.", 5400);
  await makeAccount(acme.id, "instagram", "@acme", 4200);

  console.log("✓ Done. Sign in and explore the dashboard.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
