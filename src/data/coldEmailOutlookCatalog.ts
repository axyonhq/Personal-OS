import type { ColdEmailDomain } from '../types'

let catalogIdCounter = 0
function uid(prefix = 'id') {
  catalogIdCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${catalogIdCounter}`
}

/** Bump this to force a one-time wipe + reload of the Outlook cold-email catalog. */
export const COLD_EMAIL_OUTLOOK_CATALOG_VERSION = 1

type CatalogMailbox = { localPart: string; password: string }
type CatalogDomain = { domain: string; mailboxes: CatalogMailbox[] }

/** Microsoft Outlook mailboxes from Cold Emails - OUTLOOK CSV (4 per domain). */
const OUTLOOK_CATALOG: CatalogDomain[] = [
  {
    "domain": "axionhqapp.com",
    "mailboxes": [
      {
        "localPart": "nickreibelt",
        "password": "Q%078714180325uc"
      },
      {
        "localPart": "nick",
        "password": "V/987418091806od"
      },
      {
        "localPart": "nickr",
        "password": "Q/752623292521ul"
      },
      {
        "localPart": "nreibelt",
        "password": "D@937147297313as"
      }
    ]
  },
  {
    "domain": "axionhqgrow.com",
    "mailboxes": [
      {
        "localPart": "n.reibelt",
        "password": "S%395926364751uf"
      },
      {
        "localPart": "nicholas",
        "password": "F$709331067846am"
      },
      {
        "localPart": "reibelt",
        "password": "Z@420556763398ah"
      },
      {
        "localPart": "nick.r",
        "password": "F#880232534797am"
      }
    ]
  },
  {
    "domain": "axionhqgrowth.com",
    "mailboxes": [
      {
        "localPart": "nick.reibelt",
        "password": "G&601242976441ay"
      },
      {
        "localPart": "n.r",
        "password": "L/018403822904on"
      },
      {
        "localPart": "nreibelt",
        "password": "N/458810897485uy"
      },
      {
        "localPart": "nickreibelt",
        "password": "B$296386417548ob"
      }
    ]
  },
  {
    "domain": "axionhqhq.com",
    "mailboxes": [
      {
        "localPart": "nicholas.r",
        "password": "Q(454354842547uq"
      },
      {
        "localPart": "nickr",
        "password": "B^456357140523oj"
      },
      {
        "localPart": "n.reibelt",
        "password": "M*822907887751uy"
      },
      {
        "localPart": "nick",
        "password": "X(718252959117uj"
      }
    ]
  },
  {
    "domain": "axionhqhubs.com",
    "mailboxes": [
      {
        "localPart": "reibelt",
        "password": "T*218989218415of"
      },
      {
        "localPart": "nicholasr",
        "password": "C/148593414856uh"
      },
      {
        "localPart": "nick",
        "password": "B%656512575040aw"
      },
      {
        "localPart": "nreibelt",
        "password": "Y%827803334122aq"
      }
    ]
  },
  {
    "domain": "axionhqlabs.com",
    "mailboxes": [
      {
        "localPart": "nreibelt",
        "password": "N(689985880317ak"
      },
      {
        "localPart": "nicholas",
        "password": "Y@218319135582og"
      },
      {
        "localPart": "n.nick",
        "password": "Q/920378177234og"
      },
      {
        "localPart": "nickreibelt",
        "password": "S@175766323352ab"
      }
    ]
  },
  {
    "domain": "axionhqoperations.com",
    "mailboxes": [
      {
        "localPart": "nickr",
        "password": "C*628187409539ac"
      },
      {
        "localPart": "reibeltn",
        "password": "J)489441550518ad"
      },
      {
        "localPart": "n.r",
        "password": "C#599008801063ul"
      },
      {
        "localPart": "nick.reibelt",
        "password": "W)512275784268am"
      }
    ]
  },
  {
    "domain": "axyonapp.com",
    "mailboxes": [
      {
        "localPart": "nick",
        "password": "F!735221662312av"
      },
      {
        "localPart": "n.reibelt",
        "password": "Q$471781789704ar"
      },
      {
        "localPart": "nicholas",
        "password": "R$893901114298aj"
      },
      {
        "localPart": "nickreibelt",
        "password": "D.142460346612az"
      }
    ]
  },
  {
    "domain": "axyongrow.com",
    "mailboxes": [
      {
        "localPart": "reibelt",
        "password": "B!900772928563ux"
      },
      {
        "localPart": "nreibelt",
        "password": "L&601376316442ux"
      },
      {
        "localPart": "nicholas.reibelt",
        "password": "B.463750186340us"
      },
      {
        "localPart": "nick.r",
        "password": "R@503347290005an"
      }
    ]
  },
  {
    "domain": "axyongrowth.com",
    "mailboxes": [
      {
        "localPart": "n.r",
        "password": "G*356426342272up"
      },
      {
        "localPart": "nickreibelt",
        "password": "K@138225916151uq"
      },
      {
        "localPart": "nick",
        "password": "P%705789114181oz"
      },
      {
        "localPart": "nickr",
        "password": "F&838260302728ob"
      }
    ]
  },
  {
    "domain": "axyonhubs.com",
    "mailboxes": [
      {
        "localPart": "nick.reibelt",
        "password": "G%293099712509uc"
      },
      {
        "localPart": "nick",
        "password": "Z^707653851377ad"
      },
      {
        "localPart": "nickr",
        "password": "M$079655209326am"
      },
      {
        "localPart": "nreibelt",
        "password": "W.991519919852op"
      }
    ]
  },
  {
    "domain": "axyonoperations.com",
    "mailboxes": [
      {
        "localPart": "n.reibelt",
        "password": "F)972153341617uf"
      },
      {
        "localPart": "nick",
        "password": "R%908182468926ac"
      },
      {
        "localPart": "nickreibelt",
        "password": "D%861022371239uy"
      },
      {
        "localPart": "reibelt",
        "password": "W(269343191407uw"
      }
    ]
  },
  {
    "domain": "getaxionhq.com",
    "mailboxes": [
      {
        "localPart": "nick.r",
        "password": "V#573958109266on"
      },
      {
        "localPart": "nreibelt",
        "password": "Z*700872174446ob"
      },
      {
        "localPart": "nick",
        "password": "V)586042871211og"
      },
      {
        "localPart": "nickrei",
        "password": "X*762808563173ug"
      }
    ]
  },
  {
    "domain": "getaxyon.com",
    "mailboxes": [
      {
        "localPart": "nick.reibelt",
        "password": "B$405535917429ab"
      },
      {
        "localPart": "nickr",
        "password": "R%979235573900al"
      },
      {
        "localPart": "nreib",
        "password": "V&523056248943of"
      },
      {
        "localPart": "reibelt",
        "password": "P.670105533566oc"
      }
    ]
  },
  {
    "domain": "growaxionhq.com",
    "mailboxes": [
      {
        "localPart": "n.reibelt",
        "password": "X&302171484603am"
      },
      {
        "localPart": "nick",
        "password": "P)977276616417up"
      },
      {
        "localPart": "nickreibelt",
        "password": "B!577909045806ar"
      },
      {
        "localPart": "nrei",
        "password": "M&162076097408uj"
      }
    ]
  },
  {
    "domain": "growaxyon.com",
    "mailboxes": [
      {
        "localPart": "nick.reibelt",
        "password": "Z^354125729712ad"
      },
      {
        "localPart": "nickr",
        "password": "T#179575345556uc"
      },
      {
        "localPart": "nickreib",
        "password": "R$073666733510uk"
      },
      {
        "localPart": "nreibelt",
        "password": "H#968268053813ar"
      }
    ]
  },
  {
    "domain": "growthaxyon.com",
    "mailboxes": [
      {
        "localPart": "n.reibelt",
        "password": "Z$539418865052ub"
      },
      {
        "localPart": "nick",
        "password": "J#194674669099ac"
      },
      {
        "localPart": "nickrei",
        "password": "S&062353848350oz"
      },
      {
        "localPart": "reibelt",
        "password": "T*984892252711un"
      }
    ]
  },
  {
    "domain": "meetaxionhq.com",
    "mailboxes": [
      {
        "localPart": "nick.r",
        "password": "D#909280647958oq"
      },
      {
        "localPart": "nick",
        "password": "J^143977897640ur"
      },
      {
        "localPart": "nickreibelt",
        "password": "K%809585932262oz"
      },
      {
        "localPart": "nreibelt",
        "password": "X$532749338569ug"
      }
    ]
  },
  {
    "domain": "meetaxyon.com",
    "mailboxes": [
      {
        "localPart": "nick.reibelt",
        "password": "G(612265428531od"
      },
      {
        "localPart": "nick",
        "password": "K@306167606684an"
      },
      {
        "localPart": "nickr",
        "password": "F!321347124574of"
      },
      {
        "localPart": "nreib",
        "password": "D%380214077792ur"
      }
    ]
  },
  {
    "domain": "openaxionhq.com",
    "mailboxes": [
      {
        "localPart": "n.reibelt",
        "password": "H@939802657791ob"
      },
      {
        "localPart": "nick",
        "password": "N.346436129989oj"
      },
      {
        "localPart": "nrei",
        "password": "M%494523939526uy"
      },
      {
        "localPart": "nreibelt",
        "password": "Y!487606513121uj"
      }
    ]
  },
  {
    "domain": "openaxyon.com",
    "mailboxes": [
      {
        "localPart": "nick.reibelt",
        "password": "K$323927697231az"
      },
      {
        "localPart": "nickr",
        "password": "T/842434386797oj"
      },
      {
        "localPart": "nickrei",
        "password": "Z&263443059842oh"
      },
      {
        "localPart": "nickreibelt",
        "password": "T&380175154411uz"
      }
    ]
  },
  {
    "domain": "theaxionhq.com",
    "mailboxes": [
      {
        "localPart": "nick.r",
        "password": "L#829677149177uv"
      },
      {
        "localPart": "nick",
        "password": "D(753728344627af"
      },
      {
        "localPart": "nreibelt",
        "password": "J(544065652868ut"
      },
      {
        "localPart": "reibelt",
        "password": "B!464907970080ux"
      }
    ]
  },
  {
    "domain": "theaxyon.com",
    "mailboxes": [
      {
        "localPart": "n.reibelt",
        "password": "N)316696418597uq"
      },
      {
        "localPart": "nick.reibelt",
        "password": "Q$944633071043uj"
      },
      {
        "localPart": "nick",
        "password": "L%735309010388as"
      },
      {
        "localPart": "nickreib",
        "password": "D!289043889546us"
      }
    ]
  },
  {
    "domain": "useaxionhq.com",
    "mailboxes": [
      {
        "localPart": "nickr",
        "password": "Z$221229223921oy"
      },
      {
        "localPart": "nickreibelt",
        "password": "B^779875706182oc"
      },
      {
        "localPart": "nreib",
        "password": "L.856400066109oh"
      },
      {
        "localPart": "nreibelt",
        "password": "Z*214421532419af"
      }
    ]
  },
  {
    "domain": "useaxyon.com",
    "mailboxes": [
      {
        "localPart": "nick.reibelt",
        "password": "C*364282585995oh"
      },
      {
        "localPart": "nick",
        "password": "G.006893730552af"
      },
      {
        "localPart": "nickrei",
        "password": "D!685367571334od"
      },
      {
        "localPart": "reibelt",
        "password": "H%798111380761uz"
      }
    ]
  }
]

export function buildOutlookColdEmailDomains(now = new Date().toISOString()): ColdEmailDomain[] {
  return OUTLOOK_CATALOG.map((entry) => ({
    id: uid('cedom'),
    domain: entry.domain,
    provider: 'microsoft' as const,
    mailboxes: entry.mailboxes.map((box) => ({
      id: uid('mbox'),
      localPart: box.localPart,
      password: box.password,
      createdAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  }))
}
