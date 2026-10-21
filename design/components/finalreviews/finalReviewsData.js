/* Sample data for the final-review slot sign-up (C2) — verbatim from the brief's sample-data.json
   (uploads/2026-10-20-final-review-signup/), in the API's own shapes, plus two generated variants.
   Kit-only: the codebase reads the real endpoints (brief §8). */
window.GT_FINAL_REVIEWS_SAMPLE = {
 "about": "Sample data for the C2 final-review sign-up round (brief: README.md in this folder). One class at UC Santa Cruz in the API's shapes (brief section 8). Ids are readable stand-ins for UUIDs; people, teams and the Zoom link are made up. Times are instants in UTC; the campus zone is America/Los_Angeles, PST (UTC-8) in December, so 17:00Z is 9:00 AM on campus.",
 "class": {
  "id": "c-cse115a-f26",
  "label": "CSE 115A · Fall 2026",
  "school": "UC Santa Cruz",
  "school_zone": "America/Los_Angeles",
  "instructor": {
   "user_id": "u-dana-whitfield",
   "name": "Dana Whitfield"
  }
 },
 "clocks": {
  "booking_week": {
   "now": "2026-11-30T18:00:00Z",
   "note": "Mon Nov 30, 10:00 AM PT. Sign-ups open; 7 of 10 teams have booked."
  },
  "review_day": {
   "now": "2026-12-07T17:20:00Z",
   "note": "Mon Dec 7, 9:20 AM PT. Render with signups_open false (the instructor closed sign-ups on Friday). Trailhead's review is live; Night Owls' becomes joinable at 9:50 AM."
  },
  "after": {
   "now": "2026-12-09T20:00:00Z",
   "note": "Wed Dec 9, 12:00 PM PT. Every review is past."
  }
 },
 "viewer_zones": {
  "campus": "America/Los_Angeles",
  "abroad": "Asia/Kolkata",
  "note": "In India (GMT+5:30) the 9:00 AM PT slot reads 10:30 PM the same day; the 3:00 PM PT slot reads 4:30 AM the next day."
 },
 "review_slots_staff": {
  "class_id": "c-cse115a-f26",
  "signups_open": true,
  "slots": [
   {
    "id": "s-1207-0900",
    "starts_at": "2026-12-07T17:00:00+00:00",
    "duration_minutes": 60,
    "team": {
     "project_id": "p-trailhead",
     "name": "Trailhead"
    }
   },
   {
    "id": "s-1207-1000",
    "starts_at": "2026-12-07T18:00:00+00:00",
    "duration_minutes": 60,
    "team": {
     "project_id": "p-night-owls",
     "name": "Night Owls"
    }
   },
   {
    "id": "s-1207-1100",
    "starts_at": "2026-12-07T19:00:00+00:00",
    "duration_minutes": 60,
    "team": null
   },
   {
    "id": "s-1207-1300",
    "starts_at": "2026-12-07T21:00:00+00:00",
    "duration_minutes": 60,
    "team": {
     "project_id": "p-redwood-labs",
     "name": "Redwood Labs"
    }
   },
   {
    "id": "s-1207-1400",
    "starts_at": "2026-12-07T22:00:00+00:00",
    "duration_minutes": 60,
    "team": null
   },
   {
    "id": "s-1207-1500",
    "starts_at": "2026-12-07T23:00:00+00:00",
    "duration_minutes": 60,
    "team": {
     "project_id": "p-tidepool",
     "name": "Tidepool"
    }
   },
   {
    "id": "s-1208-0900",
    "starts_at": "2026-12-08T17:00:00+00:00",
    "duration_minutes": 60,
    "team": {
     "project_id": "p-lighthouse",
     "name": "Lighthouse"
    }
   },
   {
    "id": "s-1208-1000",
    "starts_at": "2026-12-08T18:00:00+00:00",
    "duration_minutes": 60,
    "team": null
   },
   {
    "id": "s-1208-1100",
    "starts_at": "2026-12-08T19:00:00+00:00",
    "duration_minutes": 60,
    "team": {
     "project_id": "p-seabright",
     "name": "Seabright"
    }
   },
   {
    "id": "s-1208-1300",
    "starts_at": "2026-12-08T21:00:00+00:00",
    "duration_minutes": 60,
    "team": null
   },
   {
    "id": "s-1208-1400",
    "starts_at": "2026-12-08T22:00:00+00:00",
    "duration_minutes": 60,
    "team": {
     "project_id": "p-fog-city",
     "name": "Fog City"
    }
   },
   {
    "id": "s-1208-1500",
    "starts_at": "2026-12-08T23:00:00+00:00",
    "duration_minutes": 60,
    "team": null
   }
  ],
  "my_team": null,
  "unbooked_teams": [
   {
    "project_id": "p-arboretum",
    "name": "Arboretum",
    "product_owner": null
   },
   {
    "project_id": "p-slug-scheduler",
    "name": "Slug Scheduler",
    "product_owner": {
     "user_id": "u-ana-ruiz",
     "name": "Ana Ruiz"
    }
   },
   {
    "project_id": "p-wharf-rats",
    "name": "Wharf Rats",
    "product_owner": {
     "user_id": "u-jordan-lee",
     "name": "Jordan Lee"
    }
   }
  ],
  "review_zoom_url": "https://zoom.example.edu/j/123456789"
 },
 "students": {
  "note": "Students get the staff payload's class_id, signups_open and slots, with unbooked_teams [] and review_zoom_url null, plus the my_team of their case below. my_team.product_owner is the field the C2 implementation adds (brief section 8).",
  "product_owner_not_booked": {
   "viewer": {
    "user_id": "u-ana-ruiz",
    "name": "Ana Ruiz"
   },
   "my_team": {
    "project_id": "p-slug-scheduler",
    "name": "Slug Scheduler",
    "is_product_owner": true,
    "slot_id": null,
    "starts_at": null,
    "zoom_url": null,
    "home_ta": null,
    "review_ta": null,
    "product_owner": {
     "user_id": "u-ana-ruiz",
     "name": "Ana Ruiz"
    }
   }
  },
  "product_owner_booked": {
   "viewer": {
    "user_id": "u-kai-moreno",
    "name": "Kai Moreno"
   },
   "my_team": {
    "project_id": "p-trailhead",
    "name": "Trailhead",
    "is_product_owner": true,
    "slot_id": "s-1207-0900",
    "starts_at": "2026-12-07T17:00:00+00:00",
    "zoom_url": "https://zoom.example.edu/j/123456789",
    "home_ta": {
     "user_id": "u-maya-chen",
     "name": "Maya Chen"
    },
    "review_ta": {
     "user_id": "u-luis-ortega",
     "name": "Luis Ortega"
    },
    "product_owner": {
     "user_id": "u-kai-moreno",
     "name": "Kai Moreno"
    }
   }
  },
  "member_booked_no_review_ta": {
   "viewer": {
    "user_id": "u-noor-haddad",
    "name": "Noor Haddad"
   },
   "my_team": {
    "project_id": "p-redwood-labs",
    "name": "Redwood Labs",
    "is_product_owner": false,
    "slot_id": "s-1207-1300",
    "starts_at": "2026-12-07T21:00:00+00:00",
    "zoom_url": "https://zoom.example.edu/j/123456789",
    "home_ta": {
     "user_id": "u-maya-chen",
     "name": "Maya Chen"
    },
    "review_ta": null,
    "product_owner": {
     "user_id": "u-eli-brooks",
     "name": "Eli Brooks"
    }
   }
  },
  "member_not_booked": {
   "viewer": {
    "user_id": "u-rio-santos",
    "name": "Rio Santos"
   },
   "my_team": {
    "project_id": "p-wharf-rats",
    "name": "Wharf Rats",
    "is_product_owner": false,
    "slot_id": null,
    "starts_at": null,
    "zoom_url": null,
    "home_ta": null,
    "review_ta": null,
    "product_owner": {
     "user_id": "u-jordan-lee",
     "name": "Jordan Lee"
    }
   }
  },
  "member_no_product_owner": {
   "viewer": {
    "user_id": "u-tess-park",
    "name": "Tess Park"
   },
   "my_team": {
    "project_id": "p-arboretum",
    "name": "Arboretum",
    "is_product_owner": false,
    "slot_id": null,
    "starts_at": null,
    "zoom_url": null,
    "home_ta": null,
    "review_ta": null,
    "product_owner": null
   }
  },
  "no_team": {
   "viewer": {
    "user_id": "u-lee-student",
    "name": "Lee Student"
   },
   "my_team": null
  }
 },
 "final_review_schedule": {
  "class_id": "c-cse115a-f26",
  "review_zoom_url": "https://zoom.example.edu/j/123456789",
  "review_period_open": true,
  "my_review_count": 0,
  "teams": [
   {
    "project_id": "p-trailhead",
    "name": "Trailhead",
    "final_review_at": "2026-12-07T17:00:00+00:00",
    "home_ta": {
     "user_id": "u-maya-chen",
     "name": "Maya Chen",
     "email": "maya.chen@example.edu"
    },
    "review_ta": {
     "user_id": "u-luis-ortega",
     "name": "Luis Ortega",
     "email": "luis.ortega@example.edu",
     "claimed_at": "2026-11-30T17:05:00+00:00"
    }
   },
   {
    "project_id": "p-night-owls",
    "name": "Night Owls",
    "final_review_at": "2026-12-07T18:00:00+00:00",
    "home_ta": {
     "user_id": "u-luis-ortega",
     "name": "Luis Ortega",
     "email": "luis.ortega@example.edu"
    },
    "review_ta": {
     "user_id": "u-maya-chen",
     "name": "Maya Chen",
     "email": "maya.chen@example.edu",
     "claimed_at": "2026-11-30T17:05:00+00:00"
    }
   },
   {
    "project_id": "p-redwood-labs",
    "name": "Redwood Labs",
    "final_review_at": "2026-12-07T21:00:00+00:00",
    "home_ta": {
     "user_id": "u-maya-chen",
     "name": "Maya Chen",
     "email": "maya.chen@example.edu"
    },
    "review_ta": null
   },
   {
    "project_id": "p-tidepool",
    "name": "Tidepool",
    "final_review_at": "2026-12-07T23:00:00+00:00",
    "home_ta": {
     "user_id": "u-priya-nair",
     "name": "Priya Nair",
     "email": "priya.nair@example.edu"
    },
    "review_ta": {
     "user_id": "u-sam-okafor",
     "name": "Sam Okafor",
     "email": "sam.okafor@example.edu",
     "claimed_at": "2026-11-30T17:05:00+00:00"
    }
   },
   {
    "project_id": "p-lighthouse",
    "name": "Lighthouse",
    "final_review_at": "2026-12-08T17:00:00+00:00",
    "home_ta": {
     "user_id": "u-sam-okafor",
     "name": "Sam Okafor",
     "email": "sam.okafor@example.edu"
    },
    "review_ta": null
   },
   {
    "project_id": "p-seabright",
    "name": "Seabright",
    "final_review_at": "2026-12-08T19:00:00+00:00",
    "home_ta": {
     "user_id": "u-luis-ortega",
     "name": "Luis Ortega",
     "email": "luis.ortega@example.edu"
    },
    "review_ta": {
     "user_id": "u-priya-nair",
     "name": "Priya Nair",
     "email": "priya.nair@example.edu",
     "claimed_at": "2026-11-30T17:05:00+00:00"
    }
   },
   {
    "project_id": "p-fog-city",
    "name": "Fog City",
    "final_review_at": "2026-12-08T22:00:00+00:00",
    "home_ta": {
     "user_id": "u-priya-nair",
     "name": "Priya Nair",
     "email": "priya.nair@example.edu"
    },
    "review_ta": null
   },
   {
    "project_id": "p-arboretum",
    "name": "Arboretum",
    "final_review_at": null,
    "home_ta": null,
    "review_ta": null
   },
   {
    "project_id": "p-slug-scheduler",
    "name": "Slug Scheduler",
    "final_review_at": null,
    "home_ta": {
     "user_id": "u-sam-okafor",
     "name": "Sam Okafor",
     "email": "sam.okafor@example.edu"
    },
    "review_ta": null
   },
   {
    "project_id": "p-wharf-rats",
    "name": "Wharf Rats",
    "final_review_at": null,
    "home_ta": {
     "user_id": "u-maya-chen",
     "name": "Maya Chen",
     "email": "maya.chen@example.edu"
    },
    "review_ta": null
   }
  ]
 },
 "ta_viewer": {
  "viewer": {
   "user_id": "u-maya-chen",
   "name": "Maya Chen"
  },
  "my_review_count": 1,
  "note": "A TA gets the same two payloads as the instructor; final-reviews differs only in my_review_count. Maya Chen is the Home TA of Trailhead, Redwood Labs and Wharf Rats, and the Review TA of Night Owls."
 },
 "class_tas": {
  "tas": [
   {
    "id": "u-luis-ortega",
    "name": "Luis Ortega",
    "email": "luis.ortega@example.edu",
    "projects": [
     {
      "id": "p-night-owls",
      "name": "Night Owls"
     },
     {
      "id": "p-seabright",
      "name": "Seabright"
     }
    ]
   },
   {
    "id": "u-maya-chen",
    "name": "Maya Chen",
    "email": "maya.chen@example.edu",
    "projects": [
     {
      "id": "p-redwood-labs",
      "name": "Redwood Labs"
     },
     {
      "id": "p-trailhead",
      "name": "Trailhead"
     },
     {
      "id": "p-wharf-rats",
      "name": "Wharf Rats"
     }
    ]
   },
   {
    "id": "u-priya-nair",
    "name": "Priya Nair",
    "email": "priya.nair@example.edu",
    "projects": [
     {
      "id": "p-fog-city",
      "name": "Fog City"
     },
     {
      "id": "p-tidepool",
      "name": "Tidepool"
     }
    ]
   },
   {
    "id": "u-sam-okafor",
    "name": "Sam Okafor",
    "email": "sam.okafor@example.edu",
    "projects": [
     {
      "id": "p-lighthouse",
      "name": "Lighthouse"
     },
     {
      "id": "p-slug-scheduler",
      "name": "Slug Scheduler"
     }
    ]
   }
  ]
 },
 "empty_class": {
  "note": "No slots posted yet and sign-ups closed: every team is without a slot.",
  "review_slots_staff": {
   "class_id": "c-cse115a-f26",
   "signups_open": false,
   "slots": [],
   "my_team": null,
   "unbooked_teams": [
    {
     "project_id": "p-arboretum",
     "name": "Arboretum",
     "product_owner": null
    },
    {
     "project_id": "p-fog-city",
     "name": "Fog City",
     "product_owner": null
    },
    {
     "project_id": "p-lighthouse",
     "name": "Lighthouse",
     "product_owner": null
    },
    {
     "project_id": "p-night-owls",
     "name": "Night Owls",
     "product_owner": null
    },
    {
     "project_id": "p-redwood-labs",
     "name": "Redwood Labs",
     "product_owner": {
      "user_id": "u-eli-brooks",
      "name": "Eli Brooks"
     }
    },
    {
     "project_id": "p-seabright",
     "name": "Seabright",
     "product_owner": null
    },
    {
     "project_id": "p-slug-scheduler",
     "name": "Slug Scheduler",
     "product_owner": {
      "user_id": "u-ana-ruiz",
      "name": "Ana Ruiz"
     }
    },
    {
     "project_id": "p-tidepool",
     "name": "Tidepool",
     "product_owner": null
    },
    {
     "project_id": "p-trailhead",
     "name": "Trailhead",
     "product_owner": {
      "user_id": "u-kai-moreno",
      "name": "Kai Moreno"
     }
    },
    {
     "project_id": "p-wharf-rats",
     "name": "Wharf Rats",
     "product_owner": {
      "user_id": "u-jordan-lee",
      "name": "Jordan Lee"
     }
    }
   ],
   "review_zoom_url": null
  }
 }
};

/* Generated variants (kit-only): "many" = a 36-team class over five days (40 slots), "history" = the finished
   summer class from before slots (review times in the staff read, no slots, read-only). */
(function () {
  var S = window.GT_FINAL_REVIEWS_SAMPLE;
  var TAS = S.class_tas.tas.map(function (t) { return { user_id: t.id, name: t.name }; });
  var NAMES = ['Trailhead', 'Night Owls', 'Redwood Labs', 'Tidepool', 'Lighthouse', 'Seabright', 'Fog City', 'Arboretum', 'Slug Scheduler', 'Wharf Rats',
    'Banana Slugs Who Ship On Fridays And Never On Mondays', 'Porter Meadow', 'Kresge Commons', 'Cowell Ranch', 'Natural Bridges', 'Pogonip', 'Moss Landing', 'Big Basin',
    'Capitola Pier Collective', 'Westcliff', 'Twin Lakes', 'Pleasure Point', 'Elkhorn Slough', 'Quarry Amphitheater', 'Science Hill', 'East Field', 'Baskin Builders',
    'McHenry Late Nights', 'Stevenson Stack', 'Crown Merrill', 'Rachel Carson', 'Oakes Overflow', 'The Upper Campus Shuttle', 'Hagar Court', 'Empire Grade', 'Coolidge Drive'];
  var PEOPLE = ['Ana Ruiz', 'Jordan Lee', 'Kai Moreno', 'Eli Brooks', 'Noor Haddad', 'Rio Santos', 'Tess Park', 'Mina Patel', 'Diego Alvarez', 'Hana Kim', 'Omar Said', 'Lena Fischer'];
  var id = function (n) { return 'p-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var slots = [], teams = [], unbooked = [];
  var days = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11'];
  var free = { '2026-12-07|13': 1, '2026-12-08|10': 1, '2026-12-08|15': 1, '2026-12-09|9': 1, '2026-12-10|14': 1, '2026-12-11|11': 1, '2026-12-11|15': 1, '2026-12-11|16': 1 };
  var t = 0;
  days.forEach(function (d) {
    for (var h = 9; h <= 16; h++) {
      var z = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h + 8));
      var sid = 's-' + d.slice(5).replace('-', '') + '-' + pad(h) + '00';
      var team = null;
      if (!free[d + '|' + h] && t < 30) {
        var name = NAMES[t];
        team = { project_id: id(name), name: name };
        var home = TAS[t % 4], review = t % 3 === 2 ? null : TAS[(t + 1 + (t % 2)) % 4];
        teams.push({ project_id: team.project_id, name: name, final_review_at: z.toISOString().replace('.000Z', '+00:00'), home_ta: home, review_ta: review });
        t++;
      }
      slots.push({ id: sid, starts_at: z.toISOString().replace('.000Z', '+00:00'), duration_minutes: 60, team: team });
    }
  });
  for (; t < NAMES.length; t++) {
    var nm = NAMES[t];
    var po = t % 2 ? { user_id: 'u-' + t, name: PEOPLE[t % PEOPLE.length] } : null;
    unbooked.push({ project_id: id(nm), name: nm, product_owner: po });
    teams.push({ project_id: id(nm), name: nm, final_review_at: null, home_ta: TAS[t % 4], review_ta: t === 31 ? TAS[(t + 2) % 4] : null });
  }
  S.many = {
    review_slots_staff: { class_id: S.class.id, signups_open: true, slots: slots, my_team: null, unbooked_teams: unbooked, review_zoom_url: S.review_slots_staff.review_zoom_url },
    final_review_schedule: { class_id: S.class.id, review_zoom_url: S.review_slots_staff.review_zoom_url, review_period_open: true, my_review_count: 0, teams: teams },
  };
  var hist = S.final_review_schedule.teams.map(function (x, i) {
    var day = i < 5 ? '2026-08-20' : '2026-08-21', h = 9 + (i % 5);
    return Object.assign({}, x, { final_review_at: new Date(Date.UTC(2026, 7, +day.slice(8), h + 7)).toISOString().replace('.000Z', '+00:00') });
  });
  S.history = {
    class_label: 'CSE 115A · Summer 2026', complete: true, now: '2026-09-02T19:00:00Z',
    review_slots_staff: { class_id: 'c-cse115a-s26', signups_open: false, slots: [], my_team: null,
      unbooked_teams: hist.map(function (x) { return { project_id: x.project_id, name: x.name, product_owner: null }; }), review_zoom_url: S.review_slots_staff.review_zoom_url },
    final_review_schedule: { class_id: 'c-cse115a-s26', review_zoom_url: S.review_slots_staff.review_zoom_url, review_period_open: false, my_review_count: 0, teams: hist },
  };
})();

/* World → API payloads (kit-only): one mutable "world" per class, and the payloads each viewer would
   receive from it (brief §4 + §8 — students get no staff fields; my_team fills in once the team holds a slot). */
(function () {
  var S = window.GT_FINAL_REVIEWS_SAMPLE;
  var st = S.students;
  var VIEWERS = {
    instructor: { key: 'instructor', label: 'Instructor', role: 'instructor', user: S.class.instructor },
    ta: { key: 'ta', label: 'TA (Maya Chen)', role: 'ta', user: S.ta_viewer.viewer },
    po: { key: 'po', label: 'Product Owner, not booked', role: 'student', user: st.product_owner_not_booked.viewer, teamId: 'p-slug-scheduler' },
    po_booked: { key: 'po_booked', label: 'Product Owner, booked', role: 'student', user: st.product_owner_booked.viewer, teamId: 'p-trailhead' },
    member: { key: 'member', label: 'Member, booked', role: 'student', user: st.member_booked_no_review_ta.viewer, teamId: 'p-redwood-labs' },
    member_wait: { key: 'member_wait', label: 'Member, not booked', role: 'student', user: st.member_not_booked.viewer, teamId: 'p-wharf-rats' },
    no_po: { key: 'no_po', label: 'Member, no Product Owner', role: 'student', user: st.member_no_product_owner.viewer, teamId: 'p-arboretum' },
    no_team: { key: 'no_team', label: 'Student on no team', role: 'student', user: st.no_team.viewer, teamId: null },
    preview: { key: 'preview', label: 'Instructor previewing as student', role: 'instructor', preview: true, user: S.class.instructor },
  };
  var byName = function (a, b) { return String(a.name).localeCompare(String(b.name)); };
  var person = function (p) { return p ? { user_id: p.user_id, name: p.name } : null; };
  function worldFrom(src, opts) {
    opts = opts || {};
    var rs = src.review_slots_staff, fs = src.final_review_schedule || S.final_review_schedule;
    var teams = {};
    (fs.teams || []).forEach(function (t) { teams[t.project_id] = { project_id: t.project_id, name: t.name, home_ta: person(t.home_ta), review_ta: person(t.review_ta), product_owner: null, legacy_at: t.final_review_at }; });
    (rs.unbooked_teams || []).forEach(function (t) { teams[t.project_id] = Object.assign(teams[t.project_id] || { project_id: t.project_id, name: t.name, home_ta: null, review_ta: null }, { product_owner: person(t.product_owner) }); });
    Object.keys(st).forEach(function (k) { var m = st[k].my_team; if (m && teams[m.project_id] && m.product_owner && !teams[m.project_id].product_owner) teams[m.project_id].product_owner = person(m.product_owner); });
    return {
      classId: rs.class_id, signupsOpen: rs.signups_open, zoomUrl: rs.review_zoom_url, complete: !!opts.complete,
      slots: rs.slots.map(function (x) { return { id: x.id, starts_at: x.starts_at, duration_minutes: x.duration_minutes || 60, teamId: x.team ? x.team.project_id : null }; }),
      teams: teams, tas: S.class_tas.tas,
    };
  }
  function payloadFor(world, key) {
    var v = VIEWERS[key];
    var held = {};
    world.slots.forEach(function (x) { if (x.teamId) held[x.teamId] = x; });
    var staff = v.role !== 'student';
    var slots = world.slots.slice().sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); }).map(function (x) {
      return { id: x.id, starts_at: x.starts_at, duration_minutes: x.duration_minutes || 60, team: x.teamId ? { project_id: x.teamId, name: world.teams[x.teamId].name } : null };
    });
    var all = Object.keys(world.teams).map(function (k) { return world.teams[k]; });
    var my = null;
    if (v.teamId && world.teams[v.teamId]) {
      var t = world.teams[v.teamId], h = held[v.teamId];
      my = { project_id: t.project_id, name: t.name, is_product_owner: !!(t.product_owner && t.product_owner.user_id === v.user.user_id),
        slot_id: h ? h.id : null, starts_at: h ? h.starts_at : null, zoom_url: h ? world.zoomUrl : null,
        home_ta: h ? t.home_ta : null, review_ta: h ? t.review_ta : null, product_owner: t.product_owner };
    }
    var reviewSlots = {
      class_id: world.classId, signups_open: world.signupsOpen, slots: slots, my_team: v.preview ? null : my,
      unbooked_teams: staff ? all.filter(function (t) { return !held[t.project_id]; }).sort(byName).map(function (t) { return { project_id: t.project_id, name: t.name, product_owner: t.product_owner }; }) : [],
      review_zoom_url: staff ? world.zoomUrl : null,
    };
    var schedule = staff ? {
      class_id: world.classId, review_zoom_url: world.zoomUrl, review_period_open: world.signupsOpen,
      my_review_count: all.filter(function (t) { return t.review_ta && t.review_ta.user_id === v.user.user_id; }).length,
      teams: all.map(function (t) { return { project_id: t.project_id, name: t.name, final_review_at: held[t.project_id] ? held[t.project_id].starts_at : (world.slots.length ? null : t.legacy_at || null), home_ta: t.home_ta, review_ta: t.review_ta }; })
        .sort(function (a, b) { if (!a.final_review_at) return b.final_review_at ? 1 : byName(a, b); if (!b.final_review_at) return -1; return new Date(a.final_review_at) - new Date(b.final_review_at); }),
    } : null;
    var lens = v.preview ? 'preview' : v.role === 'instructor' ? 'instructor' : v.role === 'ta' ? 'ta' : !my ? 'no_team' : my.is_product_owner ? 'po' : 'member';
    return { reviewSlots: reviewSlots, schedule: schedule, viewer: v, viewerId: v.user.user_id, lens: lens, myTeam: v.preview ? null : my };
  }
  function emptySource() {
    return { review_slots_staff: S.empty_class.review_slots_staff, final_review_schedule: { teams: S.final_review_schedule.teams.map(function (t) { return Object.assign({}, t, { final_review_at: null, review_ta: null }); }) } };
  }
  window.GT_FR = { VIEWERS: VIEWERS, worldFrom: worldFrom, payloadFor: payloadFor, emptySource: emptySource,
    CLOCKS: { booking_week: S.clocks.booking_week.now, review_day: S.clocks.review_day.now, after: S.clocks.after.now },
    PT: 'America/Los_Angeles', IST: 'Asia/Kolkata' };
})();
