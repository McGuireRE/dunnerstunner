/* The tap lists, from Tim's own "McGuire Property Description (Appendix D)" and his Agency Agreement's "Marketing Development,
   Appendix F" (Tim, 27 November 2026). One shared file: the First visit uses them now; the property profile, the appraisal, the
   agency agreement and the listing read the same lists, so each thing is entered once. Tim's own additions are kept in the database
   (tap_list_extras, migration 031) and added to these at run time. No page or database code here, so the tests can load it on its own.
   NZ English; "Saint Clair", never the short form. */
(function (root) {
  'use strict';
  // the rooms ready to tap, and the extra spaces from Appendix D. [base key, label, habitable]: a habitable room gets Tim's call
  // (bedroom, study, office, living, studio, sleepout, flexible room); service rooms don't.
  const ROOMS = [
    ['living', 'Living', 1], ['dining', 'Dining', 1], ['kitchen', 'Kitchen', 0], ['bedroom', 'Bedroom', 1], ['bathroom', 'Bathroom', 0],
    ['ensuite', 'Ensuite', 0], ['toilet', 'Toilet', 0], ['laundry', 'Laundry', 0], ['garage', 'Garage', 0],
  ];
  const EXTRA_ROOMS = [
    ['study', 'Study', 1], ['sleepout', 'Sleepout', 1], ['rumpus', 'Rumpus', 1], ['studio', 'Studio', 1], ['flat', 'Flat', 1], ['workshop', 'Workshop', 0],
    ['gym', 'Gym', 1], ['conservatory', 'Conservatory or sunroom', 1], ['guest_house', 'Guest house', 1], ['games_room', 'Games room', 1], ['cinema', 'Cinema', 1],
    ['storage', 'Storage', 0], ['attic', 'Attic', 1], ['other', 'Other space', 1],
  ];
  // what Tim calls a room: his judgement alone; the bedroom count comes only from these
  const ROOM_CLASSES = [['bedroom', 'Bedroom'], ['study', 'Study'], ['office', 'Office'], ['living', 'Living'], ['studio', 'Studio'], ['sleepout', 'Sleepout'], ['flexible', 'Flexible room']];
  // features to tap in a room
  const ROOM_FEATURES = ['Built-in wardrobe', 'Walk-in wardrobe', 'Heat pump', 'Woodburner', 'Fireplace', 'Panel heater', 'Underfloor heating', 'Heated towel rail',
    'Ceiling fan', 'Ventilation', 'Double glazing', 'Skylight', 'Ranch slider', 'French doors', 'Bay window', 'Window seat', 'Feature wall', 'High stud',
    'Exposed beams', 'Native timber floors', 'Carpet', 'Tiles', 'Vinyl', 'Polished concrete', 'Island bench', 'Butler\'s pantry', 'Walk-in pantry',
    'Breakfast bar', 'Gas hob', 'Induction hob', 'Double oven', 'Dishwasher', 'Shower over bath', 'Walk-in shower', 'Separate bath', 'Double vanity',
    'Storage', 'Built-in shelving', 'Sea views', 'Harbour views', 'Sun all day', 'Access to deck', 'Access to garden', 'Internal access', 'Workbench', 'Mezzanine'];

  // the property-level tap lists, each a fact on the property profile (profile_keys, migrations 028 and 031). kind: one (one choice),
  // many (any number), count (a number), chattels (any number, each with a count)
  const PROPERTY_TYPES = ['House', 'Apartment', 'Unit', 'Townhouse', 'Terrace', 'Duplex', 'Studio', 'Home and income', 'Lifestyle', 'Acreage', 'Farmlet', 'Farm',
    'Block of units', 'Section', 'Commercial: retail', 'Commercial: office', 'Commercial: industrial', 'Commercial: hospitality'];
  const TENURE = ['Freehold', 'Leasehold', 'Cross-lease', 'Unit title', 'Company share'];
  const CLADDING = ['Weatherboard', 'Brick', 'Stone', 'Roughcast', 'Plaster', 'Fibre cement', 'Linea', 'Board and batten', 'Corrugated iron', 'Cedar', 'Block', 'Monolithic', 'Mixed'];
  const ROOFING = ['Corrugated iron', 'Long run', 'Coloursteel', 'Concrete tiles', 'Clay tiles', 'Decramastic', 'Slate', 'Membrane', 'Butynol', 'Shingles'];
  const INSULATION = ['Ceiling', 'Underfloor', 'Walls', 'Partial', 'None seen', 'Unknown'];
  const FLOORING = ['Carpet', 'Native timber', 'Engineered timber', 'Laminate', 'Tiles', 'Vinyl', 'Polished concrete', 'Cork'];
  const GLAZING = ['Single', 'Double', 'Thermal break', 'Retrofit double', 'Mixed'];
  const LEVELS = ['Single level', 'Two levels', 'Three levels', 'Split level', 'Basement'];
  const EXTRA_SPACES = ['Flat', 'Conservatory or sunroom', 'Guest house', 'Study', 'Gym', 'Workshop', 'Rumpus', 'Sleepout', 'Pool', 'Sauna', 'Carport', 'Cinema',
    'Games room', 'Studio', 'Storage', 'Attic'];
  const STANDARD_CHATTELS = ['Stove', 'Rangehood', 'Oven', 'Cooktop', 'Dishwasher', 'Waste disposal', 'Light fittings', 'Smoke detectors', 'Alarm', 'Heated towel rails',
    'Heat pumps', 'Garage door remote', 'Fixed floor coverings', 'Extractor fan', 'Shed', 'Blinds', 'Curtains', 'Drapes'];
  const FEATURED_CHATTELS = ['Air conditioning', 'Broadband modem', 'Clothesline', 'Door monitor', 'Doorbell', 'Ducted heat pump', 'Electric gate', 'EV charger',
    'Fountain', 'Fire pit', 'Free-standing wardrobe', 'Freezer', 'Gas hob', 'Gas hot water', 'Glasshouse', 'Greenhouse', 'Heated floors', 'Heat lamp',
    'Hot water heat pump', 'Intercom', 'Outdoor fire', 'Pizza oven', 'Play equipment', 'Playhouse', 'Pool heating', 'Pool pump', 'Power wall', 'Refrigerator',
    'Satellite dish', 'Sauna', 'Security cameras', 'Security lights', 'Solar panels', 'Spa pool', 'Sheds', 'Sprinklers', 'Televisions', 'TV aerial',
    'Trampoline', 'Treehouse', 'Vacuum system', 'Ventilation system', 'Aviary or coop', 'Kennel', 'Water tank', 'Wind turbine', 'Woodburner', 'Coal burner'];
  const OUTDOOR = ['Drive-on access', 'Deck', 'Balcony', 'Patio', 'Courtyard', 'Fully fenced', 'Hedges', 'Pond', 'Dam', 'Stream', 'Beach', 'Boat ramp'];
  const OUTLOOK = ['City views', 'CBD views', 'Harbour views', 'Park views', 'Nature views', 'Valley views', 'Beach views', 'Sea views', 'Mountain views', 'Hill views',
    'Rural views', 'River views'];
  // [profile key, heading, kind, list]. pBed is never here: bedrooms come only from Tim's call on each room.
  const FACTS = [
    ['pType', 'Property type', 'one', PROPERTY_TYPES], ['title_type', 'Tenure', 'one', TENURE],
    ['dwellings', 'Dwellings', 'count'], ['living_dining', 'Living and dining areas', 'count'], ['pBath', 'Bathrooms', 'count'], ['ensuites', 'Ensuites', 'count'],
    ['toilets', 'Toilets', 'count'], ['garaging', 'Garaging (cars)', 'count'], ['parking_spaces', 'Parking spaces', 'count'],
    ['cladding', 'Cladding', 'many', CLADDING], ['roofing', 'Roofing', 'many', ROOFING], ['insulation', 'Insulation', 'many', INSULATION],
    ['flooring', 'Flooring', 'many', FLOORING], ['glazing', 'Glazing', 'many', GLAZING], ['levels', 'Levels', 'one', LEVELS],
    ['extra_spaces', 'Extra spaces', 'many', EXTRA_SPACES],
    ['chattels_std', 'Standard chattels', 'chattels', STANDARD_CHATTELS], ['chattels_featured', 'Featured chattels', 'chattels', FEATURED_CHATTELS],
    ['chattels_removed', 'Chattels to be removed before settlement', 'many', STANDARD_CHATTELS.concat(FEATURED_CHATTELS)],
    ['outdoor', 'Outdoor features', 'many', OUTDOOR], ['outlook', 'Outlook', 'many', OUTLOOK],
  ];
  // groups for the page, in Tim's order
  const FACT_GROUPS = [['The property', ['pType', 'title_type']], ['Counts', ['dwellings', 'living_dining', 'pBath', 'ensuites', 'toilets', 'garaging', 'parking_spaces']],
    ['Build', ['cladding', 'roofing', 'insulation', 'flooring', 'glazing', 'levels']], ['Extra spaces', ['extra_spaces']],
    ['Chattels', ['chattels_std', 'chattels_featured', 'chattels_removed']], ['Outdoors and outlook', ['outdoor', 'outlook']]];

  // the ideal buyers page (Appendix F): their story, then the ideal buyers, then "ideal for" tags. Keys are the question bank's.
  const STORY = [['story_bought', 'When did you buy, and what drew you to it?'], ['story_surprised', 'What surprised you when you moved in?'],
    ['story_setting', 'What do you appreciate about the setting and outlook?'], ['story_layout', 'What do you appreciate about the layout and spaces?'],
    ['story_location', 'What do you appreciate about the location and amenities?'], ['story_use', 'How do you use the property, and what else could it be used for?']];
  const IDEAL_BUYER = [['ib_stage', 'Age or stage of life'], ['ib_pets', 'Pets'], ['ib_hobbies', 'Hobbies'], ['ib_children', 'Children and their ages'],
    ['ib_mobility', 'Mobility or fitness'], ['ib_vehicles', 'Vehicles'], ['ib_leanings', 'Sociopolitical leanings'], ['ib_situation', 'Current situation (for example transferring, downsizing)']];
  const IDEAL_FOR = ['Growing families', 'Elderly and infirm', 'Students', 'Young families', 'First home buyers', 'Multigenerational', 'Multiple families', 'Investors',
    'Young couples', 'Tradespeople', 'Developers', 'Retirees', 'Carefree, lock and leave', 'Outdoors types', 'Nature lovers', 'Gardeners', 'Artists and creators',
    'Pet lovers', 'Sporty and fitness', 'Car enthusiasts', 'Farmers', 'Self-sufficient', 'Off-gridders', 'Hunters', 'Surfers and boaties', 'Dirt bikers and BMX',
    'Work from homers', 'Entertainers', 'Diplomats', 'Executives', 'Horse lovers', 'Hosts and B&B operators', 'Mechanics', 'Performers and dancers',
    'Luxury and sports cars'];

  // every list that Tim can add his own items to, by name (tap_list_extras.list)
  const LISTS = { room_features: ROOM_FEATURES, ideal_for: IDEAL_FOR };
  FACTS.forEach(f => { if (f[3]) LISTS[f[0]] = f[3]; });

  root.PLISTS = { ROOMS, EXTRA_ROOMS, ROOM_CLASSES, ROOM_FEATURES, FACTS, FACT_GROUPS, STORY, IDEAL_BUYER, IDEAL_FOR, LISTS,
    PROPERTY_TYPES, TENURE, STANDARD_CHATTELS, FEATURED_CHATTELS, OUTDOOR, OUTLOOK };
})(typeof window !== 'undefined' ? window : globalThis);
