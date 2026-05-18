import { expect, test } from "@playwright/test";
import {
  DEFAULT_JOB_LOCATION,
  resolveJobLocation,
  resolveJobLocationInfo,
} from "@/lib/jobs/location";

test.describe("jobs location parsing", () => {
  test("extracts explicit place of posting label", () => {
    const result = resolveJobLocationInfo({
      pdfContent:
        "Position vacant: Hospital Administrator Qualifications: Master's degree. Place of Posting: All Districts No. of Vacancy: 14 Pay: Rs. 50,000/-",
    });

    expect(result.summary).toBe("All Districts");
    expect(result.entries).toEqual([]);
  });

  test("extracts all districts from table style PDF text", () => {
    const result = resolveJobLocationInfo({
      pdfContent:
        "Sl. No. Position Qualifications/Experiences/Skills Place of Posting No. of Vacancy Pay 1.1 Hospital Administrator Qualifications: Master's degree in Healthcare/Hospital Management. All Districts 14 Rs. 50,000/- (Negotiable based on education & experience)",
    });

    expect(result.summary).toBe("All Districts");
    expect(result.entries).toEqual([
      {
        role: "Hospital Administrator",
        location: "All Districts",
      },
    ]);
  });

  test("extracts same posting location across multiple roles", () => {
    const result = resolveJobLocationInfo({
      pdfContent:
        "Sl. No. Positions Essential Qualifications No. of Vacancy Place of Posting Monthly Emolument 1.1 Manager Qualifications: MBA. 01 Shillong Rs. 39,000/- 1.2 Assistant Manager and Programme Associate Qualifications: Graduate. 02 (01 each) Shillong Rs. 31,200/- and Rs. 22,100/- 1.3 Field Coordinator Educational Qualification: Graduate. 01 Shillong Rs. 22,100/-",
    });

    expect(result.summary).toBe("Shillong");
    expect(result.entries).toEqual([
      {
        role: "Manager",
        location: "Shillong",
      },
      {
        role: "Assistant Manager",
        location: "Shillong",
      },
      {
        role: "Programme Associate",
        location: "Shillong",
      },
      {
        role: "Field Coordinator",
        location: "Shillong",
      },
    ]);
  });

  test("falls back to address-derived location", () => {
    expect(
      resolveJobLocation({
        content:
          "MEGHALAYA BASIN DEVELOPMENT AUTHORITY (MBDA), Upper Nongrim Hills, Behind Bethany Hospital, Shillong, East Khasi Hills District, Meghalaya - 793003",
      })
    ).toBe("Shillong");
  });

  test("defaults to Meghalaya when nothing usable is detected", () => {
    expect(
      resolveJobLocation({
        location: "Unknown",
        content: "Recruitment notice. Apply online.",
      })
    ).toBe(DEFAULT_JOB_LOCATION);
  });
});
