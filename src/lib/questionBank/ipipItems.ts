/**
 * IPIP Big Five 50-item markers (Goldberg, 1992). The International Personality Item Pool is
 * public domain: https://ipip.ori.org/
 *
 * `reverse` is relative to the trait we report. Every trait is scored in the direction of its
 * name, so the eight "Emotional Stability" items worded as worry/moodiness are reverse-keyed.
 * Scoring itself (flipping 1-5 to 5-1) happens in the scoring module, not here.
 */
export const IPIP_TRAITS = [
  "Extraversion",
  "Agreeableness",
  "Conscientiousness",
  "Emotional Stability",
  "Openness",
] as const;

export type IpipTrait = (typeof IPIP_TRAITS)[number];

export type IpipItem = { trait: IpipTrait; content: string; reverse: boolean };

const item = (trait: IpipTrait, reverse: boolean, content: string): IpipItem => ({
  trait,
  content,
  reverse,
});

export const IPIP_50_ITEMS: IpipItem[] = [
  // Extraversion
  item("Extraversion", false, "I am the life of the party."),
  item("Extraversion", true, "I don't talk a lot."),
  item("Extraversion", false, "I feel comfortable around people."),
  item("Extraversion", true, "I keep in the background."),
  item("Extraversion", false, "I start conversations."),
  item("Extraversion", true, "I have little to say."),
  item("Extraversion", false, "I talk to a lot of different people at parties."),
  item("Extraversion", true, "I don't like to draw attention to myself."),
  item("Extraversion", false, "I don't mind being the center of attention."),
  item("Extraversion", true, "I am quiet around strangers."),

  // Agreeableness
  item("Agreeableness", true, "I feel little concern for others."),
  item("Agreeableness", false, "I am interested in people."),
  item("Agreeableness", true, "I insult people."),
  item("Agreeableness", false, "I sympathize with others' feelings."),
  item("Agreeableness", true, "I am not interested in other people's problems."),
  item("Agreeableness", false, "I have a soft heart."),
  item("Agreeableness", true, "I am not really interested in others."),
  item("Agreeableness", false, "I take time out for others."),
  item("Agreeableness", false, "I feel others' emotions."),
  item("Agreeableness", false, "I make people feel at ease."),

  // Conscientiousness
  item("Conscientiousness", false, "I am always prepared."),
  item("Conscientiousness", true, "I leave my belongings around."),
  item("Conscientiousness", false, "I pay attention to details."),
  item("Conscientiousness", true, "I make a mess of things."),
  item("Conscientiousness", false, "I get chores done right away."),
  item("Conscientiousness", true, "I often forget to put things back in their proper place."),
  item("Conscientiousness", false, "I like order."),
  item("Conscientiousness", true, "I shirk my duties."),
  item("Conscientiousness", false, "I follow a schedule."),
  item("Conscientiousness", false, "I am exacting in my work."),

  // Emotional Stability (the opposite pole of Neuroticism)
  item("Emotional Stability", true, "I get stressed out easily."),
  item("Emotional Stability", false, "I am relaxed most of the time."),
  item("Emotional Stability", true, "I worry about things."),
  item("Emotional Stability", false, "I seldom feel blue."),
  item("Emotional Stability", true, "I am easily disturbed."),
  item("Emotional Stability", true, "I get upset easily."),
  item("Emotional Stability", true, "I change my mood a lot."),
  item("Emotional Stability", true, "I have frequent mood swings."),
  item("Emotional Stability", true, "I get irritated easily."),
  item("Emotional Stability", true, "I often feel blue."),

  // Openness (called Intellect/Imagination in the IPIP)
  item("Openness", false, "I have a rich vocabulary."),
  item("Openness", true, "I have difficulty understanding abstract ideas."),
  item("Openness", false, "I have a vivid imagination."),
  item("Openness", true, "I am not interested in abstract ideas."),
  item("Openness", false, "I have excellent ideas."),
  item("Openness", true, "I do not have a good imagination."),
  item("Openness", false, "I am quick to understand things."),
  item("Openness", false, "I use difficult words."),
  item("Openness", false, "I spend time reflecting on things."),
  item("Openness", false, "I am full of ideas."),
];
