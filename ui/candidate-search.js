(function () {
  "use strict";

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function normalizeSearchText(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).replace(/^\s+|\s+$/g, "");
  }

  function normalizeStringValues(input) {
    var result = [];
    var seen = {};
    var values = input && typeof input.length === "number" ? input : [];
    var index;
    var text;
    var key;

    for (index = 0; index < values.length; index += 1) {
      text = normalizeSearchText(values[index]);
      if (!text) {
        continue;
      }
      key = text.toLowerCase();
      if (hasOwn(seen, key)) {
        continue;
      }
      seen[key] = true;
      result.push(text);
    }

    return result;
  }

  function collectBigrams(text) {
    var normalized = normalizeSearchText(text).toLowerCase();
    var grams = [];
    var seen = {};
    var index;
    var gram;

    for (index = 0; index < normalized.length - 1; index += 1) {
      gram = normalized.charAt(index) + normalized.charAt(index + 1);
      if (!hasOwn(seen, gram)) {
        seen[gram] = true;
        grams.push(gram);
      }
    }

    return grams;
  }

  function buildIndex(values, getSearchText) {
    var items = values && typeof values.length === "number" ? values : [];
    var records = [];
    var grams = {};
    var index;
    var searchText;
    var normalizedText;
    var record;
    var itemGrams;
    var gramIndex;
    var gram;

    for (index = 0; index < items.length; index += 1) {
      searchText = getSearchText(items[index]);
      normalizedText = normalizeSearchText(searchText).toLowerCase();
      record = {
        value: items[index],
        searchText: normalizedText
      };
      records.push(record);

      itemGrams = collectBigrams(normalizedText);
      for (gramIndex = 0; gramIndex < itemGrams.length; gramIndex += 1) {
        gram = itemGrams[gramIndex];
        if (!hasOwn(grams, gram)) {
          grams[gram] = {};
        }
        grams[gram][index] = true;
      }
    }

    return {
      records: records,
      grams: grams
    };
  }

  function searchIndex(index, query, limit) {
    var records = index && index.records && typeof index.records.length === "number" ? index.records : [];
    var max = typeof limit === "number" && limit >= 0 ? limit : records.length;
    var normalizedQuery = normalizeSearchText(query).toLowerCase();
    var result = [];
    var candidates = {};
    var queryGrams;
    var gramIndex;
    var gram;
    var postings;
    var key;
    var recordIndex;
    var record;

    if (normalizedQuery.length <= 1) {
      for (recordIndex = 0; recordIndex < records.length && result.length < max; recordIndex += 1) {
        result.push(records[recordIndex].value);
      }
      return result;
    }

    queryGrams = collectBigrams(normalizedQuery);
    for (gramIndex = 0; gramIndex < queryGrams.length; gramIndex += 1) {
      gram = queryGrams[gramIndex];
      postings = index && index.grams ? index.grams[gram] : null;
      if (!postings) {
        return [];
      }

      if (gramIndex === 0) {
        for (key in postings) {
          if (hasOwn(postings, key)) {
            candidates[key] = true;
          }
        }
      } else {
        for (key in candidates) {
          if (hasOwn(candidates, key) && !hasOwn(postings, key)) {
            delete candidates[key];
          }
        }
      }
    }

    for (recordIndex = 0; recordIndex < records.length && result.length < max; recordIndex += 1) {
      record = records[recordIndex];
      key = String(recordIndex);
      if (hasOwn(candidates, key) && record.searchText.indexOf(normalizedQuery) !== -1) {
        result.push(record.value);
      }
    }

    return result;
  }

  window.__SCRAP_VARIANCE_CANDIDATE_SEARCH__ = {
    normalizeStringValues: normalizeStringValues,
    buildIndex: buildIndex,
    searchIndex: searchIndex
  };

  if (window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__) {
    window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__.normalizeStringValues = normalizeStringValues;
    window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__.buildIndex = buildIndex;
    window.__SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__.searchIndex = searchIndex;
  }
}());
