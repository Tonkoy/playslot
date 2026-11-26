/**
 * A booking that is someone's own purchase — as opposed to the free booking a
 * coach's group training holds its court (and the coach) with, which is not a
 * sale and is not rated as a booking. A court a player booked stays their own
 * purchase when they open it to other players, so that one is kept.
 *
 * Spread into a `reservation` where-clause.
 */
export const OWN_PURCHASE = {
  OR: [{ groupSession: null }, { groupSession: { is: { coachProfileId: null } } }],
};
